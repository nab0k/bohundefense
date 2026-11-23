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
        news = [{'name': 'Rocket Lab', 'country': 'US'}, {'name': 'Saronic Technologies', 'country': ''},
                {'name': 'ROCKET LAB', 'country': 'US'}]
        out = M.apply([], self.root, news)
        self.assertEqual(out['news_added'], ['US Rocket Lab', '-- Saronic Technologies'])
        rows = json.loads((self.root / 'atlas/companies-directory-v1.json').read_text())['companies']
        rec = [r for r in rows if r['name'] == 'Saronic Technologies'][0]
        self.assertEqual((rec['status'], rec['country'], rec['city']), ('from_news', None, None))
        self.assertEqual(M.apply([], self.root, news)['news_added'], [])  # second run: no duplicates

    def test_incomplete_or_unplaceable_is_skipped(self):
        co = copy.deepcopy(CO)
        co['claims'] = [c for c in co['claims'] if c['ref'] != 'b4:level']
        self.assertEqual(M.apply([co], self.root)['skipped'], [('Testfirma Oy', 'incomplete claims')])
        co = copy.deepcopy(CO)
        co['claims'] = [c for c in co['claims'] if c['ref'] != 'b4:city']
        self.assertEqual(M.apply([co], self.root)['profiles_added'], [])


if __name__ == '__main__':
    unittest.main()
