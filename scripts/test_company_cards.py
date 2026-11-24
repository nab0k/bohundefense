"""Run: python3 -m unittest discover -s scripts -p 'test_*.py'"""
import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cards_from_db', ROOT / 'scripts' / 'company-cards-from-db.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

CO = {'company_id': 'co_test', 'name': 'Testfirma Oy', 'country': 'FI', 'reviewed': '2026-11-23',
      'claims': [{'ref': 'b4:legal_name', 'path': '/identity/legal_name', 'value': 'Testfirma Oy'},
                 {'ref': 'b4:regno', 'path': '/identity/registration_number', 'value': {'scheme': 'FI_YTUNNUS', 'value': '1234567-8'}},
                 {'ref': 'b4:city', 'path': '/identity/city', 'value': 'TAMPERE'},
                 {'ref': 'b4:prog1', 'path': '/programmes/-', 'value': {'kind': 'edf_grant', 'ref': '101000001', 'date': '2025-01-01',
                  'counterpart': 'European Commission, European Defence Fund (EDF) EDF-2024-RA', 'defence_buyer': True,
                  'url': 'https://ec.europa.eu/x/101000001/EDF'}},
                 {'ref': 'b4:level', 'path': '/classification/defence_level', 'value': {'level': 'L3', 'confidence': 'verified', 'rule': 'R03'}},
                 {'ref': 'b4:empty', 'path': '/gaps', 'value': {}}],
      'sources': [{'ref': 'b4:reg', 'title': 'PRH register', 'url': 'https://avoindata.prh.fi/x', 'kind': 'government_register'},
                  {'ref': 'b4:ev:1', 'title': 'EDF project 101000001', 'url': 'https://ec.europa.eu/x/101000001/EDF', 'kind': 'eu_programme_record'}]}


class CardsFromDb(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / 'atlas').mkdir()
        for f in ('company-profiles-v1.json', 'companies-directory-v1.json', 'company-country-groups.geojson', 'notion-research-map.geojson'):
            shutil.copy(ROOT / 'atlas' / f, self.root / 'atlas' / f)

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_new_company_gets_catalogue_record_and_profile(self):
        before = json.loads((self.root / 'atlas/company-profiles-v1.json').read_text())['profiles']
        out = M.apply([copy.deepcopy(CO)], self.root)
        self.assertEqual(out['profiles_added'], ['FI Testfirma Oy'])
        self.assertEqual(out['catalogue_added'], ['Testfirma Oy'])
        prof = json.loads((self.root / 'atlas/company-profiles-v1.json').read_text())['profiles']
        self.assertEqual(len(prof), len(before) + 1)
        self.assertEqual({k: v for k, v in prof.items() if k in before}, before)  # nothing else changed
        self.assertIn('Testfirma Oy is a Finnish company', prof['testfirma-oy']['about']['overview'])
        self.assertEqual(M.apply([copy.deepcopy(CO)], self.root)['profiles_added'], [])  # second run: no change

    def test_published_profile_is_never_replaced(self):
        prof = json.loads((self.root / 'atlas/company-profiles-v1.json').read_text())['profiles']
        co = copy.deepcopy(CO)
        co.update(name='Patria Oyj', company_id='co_other')
        before = prof.get('patria-oyj')
        out = M.apply([co], self.root)
        self.assertEqual(out['profiles_added'], [])
        self.assertEqual(json.loads((self.root / 'atlas/company-profiles-v1.json').read_text())['profiles'].get('patria-oyj'), before)

    def test_changed_claims_rebuild_a_builder_profile(self):  # owner 23.11.2026, EDF project details
        first = M.apply([copy.deepcopy(CO)], self.root)
        self.assertEqual(len(first['profiles_added']), 1)
        co = copy.deepcopy(CO)
        prog = next(c for c in co['claims'] if c['ref'].startswith('b4:prog'))
        if prog['value'].get('kind') == 'edf_grant':
            prog['value']['edf'] = {'acronym': 'TESTA', 'title': 'Test project', 'role': 'coordinator', 'company_eu': 1500000.0,
                                    'eu_total': 9000000.0, 'partners': 12, 'start': '2025-01-01', 'end': '2027-12-31',
                                    'status': 'Ongoing', 'url': 'https://example.org/p'}
        else:
            prog['value']['note'] = 'changed'
        out = M.apply([co], self.root)
        self.assertEqual(len(out['profiles_updated']), 1)
        self.assertEqual(M.apply([co], self.root)['profiles_updated'], [])  # same claims again: no rebuild

    def test_companies_from_the_news_get_a_marked_catalogue_record(self):  # owner 23.11.2026
        # made-up names: the test runs on a copy of the live catalogue, which real news companies reach too
        # (23.11.2026 a publication part with Rocket Lab and Saronic stopped on this test)
        news = [{'name': 'Testnews Rocketworks', 'country': 'US'}, {'name': 'Testnews Seadrones', 'country': ''},
                {'name': 'TESTNEWS ROCKETWORKS', 'country': 'US'}]
        out = M.apply([], self.root, news)
        self.assertEqual(out['news_added'], ['US Testnews Rocketworks', '-- Testnews Seadrones'])
        rows = json.loads((self.root / 'atlas/companies-directory-v1.json').read_text())['companies']
        rec = [r for r in rows if r['name'] == 'Testnews Seadrones'][0]
        self.assertEqual((rec['status'], rec['country'], rec['city']), ('from_news', None, None))
        self.assertEqual(M.apply([], self.root, news)['news_added'], [])  # second run: no duplicates

    def test_incomplete_or_unplaceable_is_skipped(self):
        co = copy.deepcopy(CO)
        co['claims'] = [c for c in co['claims'] if c['ref'] != 'b4:level']
        self.assertEqual(M.apply([co], self.root)['skipped'], [('Testfirma Oy', 'incomplete claims')])
        co = copy.deepcopy(CO)
        co['claims'] = [c for c in co['claims'] if c['ref'] != 'b4:city']
        self.assertEqual(M.apply([co], self.root)['profiles_added'], [])

    def test_page_v2_figures_network_sources(self):  # EXP-035
        co = copy.deepcopy(CO)
        co['claims'][3]['value']['edf'] = {
            'acronym': 'ALPHA', 'title': 'Alpha project', 'status': 'Ongoing', 'role': 'coordinator', 'company_eu': 2.5e6, 'eu_total': 9e6,
            'partners': 3, 'start': '2025-01-01', 'end': '2027-12-31', 'url': 'https://ec.europa.eu/x/101000001/EDF',
            'participants': [{'name': 'TESTFIRMA SWEDEN AB', 'country': 'SE', 'kind': 'company', 'role': 'participant'},
                             {'name': 'PARTNER INDUSTRIES GMBH', 'country': 'DE', 'kind': 'company', 'role': 'participant'},
                             {'name': 'NATIONAL LAB', 'country': 'FI', 'kind': 'research', 'role': 'participant'}]}
        co['network'] = [{'type': 'customer', 'name': 'Finnish Navy', 'status': 'verified',
                          'evidence': [{'quote': 'The Finnish Navy ordered …', 'url': 'https://news.example/a', 'date': None}]},
                         {'type': 'supplier', 'name': 'Partner Industries', 'status': 'candidate', 'evidence': []},
                         {'type': 'bogus', 'name': 'X'}]
        co['products'] = [{'name': 'Widget', 'role': 'makes', 'status': 'verified',
                           'evidence': [{'quote': 'makes the Widget', 'url': 'https://news.example/b'}]}]
        out = M.apply([co], self.root)
        prof = json.loads((self.root / 'atlas/company-profiles-v1.json').read_text())['profiles']
        pg = prof['testfirma-oy']['page']
        self.assertEqual(pg['v'], 2)
        self.assertEqual([f['value'] for f in pg['figures']], ['€2.5M', '1', '1', '1'])  # funding, projects, ongoing, coordinates
        types = {(n['type'], n['name']) for n in pg['network']}
        self.assertIn(('funder', 'European Commission · European Defence Fund'), types)
        self.assertIn(('group', 'Testfirma Sweden Ab'), types)  # same group, not a partner
        self.assertIn(('partner', 'PARTNER INDUSTRIES GMBH'), types)
        self.assertIn(('research', 'NATIONAL LAB'), types)
        self.assertIn(('customer', 'Finnish Navy'), types)
        self.assertNotIn('Partner Industries', {n['name'] for n in pg['network']})  # already there as an EDF partner
        self.assertNotIn('X', {n['name'] for n in pg['network']})
        urls = [x['url'] for x in pg['sources']]
        self.assertEqual(len(urls), len(set(urls)))  # one link, one number
        for n in pg['network'] + pg['products']:
            for i in n.get('src') or []:
                self.assertTrue(1 <= i <= len(urls))
        self.assertEqual(pg['products'][0]['name'], 'Widget')
        # the network and products are part of the card hash: a new relation rebuilds the card
        co2 = copy.deepcopy(co); co2['products'] = []
        self.assertNotEqual(M.card_hash(co['claims'], co['sources'], co['network'], co['products']),
                            M.card_hash(co2['claims'], co2['sources'], co2['network'], co2['products']))


if __name__ == '__main__':
    unittest.main()
