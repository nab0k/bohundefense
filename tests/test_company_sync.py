import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def get_module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


sync = get_module('company_sync', 'scripts/sync-notion-companies.py')
pub = get_module('company_pub', 'scripts/build-company-publication.py')
verify = get_module('company_verify', 'scripts/validate-company-publication.py')


def page(key='11111111-1111-4111-8111-111111111111', name='Example Robotics', country='AT',
         publishable=False, review='unresolved', sanction='pending', archived=False):
    return {'object': 'page', 'id': key, 'archived': archived,
            'last_edited_time': '2026-10-23T12:00:00.000Z',
            'properties': {
                'Name': {'type': 'title', 'title': [{'plain_text': name}]},
                'Country': {'type': 'select', 'select': {'name': country}},
                'City': {'type': 'rich_text', 'rich_text': [{'plain_text': 'Vienna'}]},
                'Product': {'type': 'select', 'select': {'name': 'electronics'}},
                'Website': {'type': 'url', 'url': 'https://example.test'},
                'Source URL': {'type': 'url', 'url': 'https://source.example'},
                'About (EN)': {'type': 'rich_text', 'rich_text': [{'plain_text': 'Research source text'}]},
                'Review status': {'type': 'select', 'select': {'name': review}},
                'Sanctions': {'type': 'select', 'select': {'name': sanction}},
                'Publishable': {'type': 'checkbox', 'checkbox': publishable},
                'Flags': {'type': 'multi_select', 'multi_select': []},
            }}


class CompanyPipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'atlas').mkdir()
        self.write('industry.json', {'companies': [
            {'name': 'Example Robotics GmbH', 'country': 'AT', 'city': 'Vienna',
             'about': 'Old verified data', 'web': 'https://old.example'},
            {'name': 'Legacy Vendor', 'country': 'PL', 'city': 'Krakow',
             'about': 'Legacy research', 'web': 'https://legacy.example'},
        ]})
        self.write('companies-at.json', {'companies': []})
        self.write('notion-research-map.geojson', {'type': 'FeatureCollection', 'features': []})
        self.write('countries.geojson', {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {'a3': code, 'name': country},
             'geometry': {'type': 'Polygon', 'coordinates': [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]} }
            for code, country in (('AUT', 'Austria'), ('POL', 'Poland'))
        ]})

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, obj):
        path = self.root / 'atlas' / name
        path.write_text(json.dumps(obj), encoding='utf-8')

    def test_normalized_fields_and_no_implicit_approval(self):
        row = sync.project(page())
        self.assertEqual(row['name'], 'Example Robotics')
        self.assertEqual(row['status'], 'unverified_candidate')
        self.assertFalse(row['excluded'])
        self.assertEqual(row['country'], 'AT')
        self.assertFalse(sync.project(page(review='accepted', publishable=False))['publishable'])
        self.assertEqual(sync.project(page(review='accepted', publishable=True))['status'], 'research_publishable')

    def test_exclusion_rules_and_ukraine_redaction(self):
        self.assertTrue(sync.project(page(review='excluded'))['excluded'])
        self.assertTrue(sync.project(page(sanction='hit'))['excluded'])
        self.assertTrue(sync.project(page(country='RU'))['excluded'])
        self.assertEqual(sync.project(page(country='UA'))['city'], '')

    def test_full_scan_safety_and_duplicate_id(self):
        with self.assertRaisesRegex(RuntimeError, 'safety floor'):
            sync.prepare([page()], 2)
        with self.assertRaisesRegex(RuntimeError, 'Duplicate'):
            sync.prepare([page(), page()], 1)
        self.assertEqual(len(sync.prepare([page()], 1)), 1)

    def test_no_javascript_urls(self):
        data = page()
        data['properties']['Website']['url'] = 'javascript:alert(1)'
        self.assertEqual(sync.project(data)['website'], '')

    def test_rebuild_and_idempotent_files(self):
        rows = [sync.project(page()), sync.project(page('22222222-2222-4222-8222-222222222222',
                                                       name='Banned Vendor', review='excluded'))]
        directory, groups, stats = pub.build(self.root, rows)
        self.assertEqual(directory['schema'], 'bohun-companies-directory-v1')
        self.assertEqual(directory['total'], 2)  # one Notion + one independent legacy
        self.assertEqual(stats['excluded_by_policy'], 1)
        self.assertIn('unverified_candidate', [x['status'] for x in directory['companies']])
        self.assertEqual(groups['metadata']['total'], 2)
        target_dir = self.root / 'atlas/companies-directory-v1.json'
        target_groups = self.root / 'atlas/company-country-groups.geojson'
        self.assertTrue(pub.write_if_changed(target_dir, directory))
        self.assertTrue(pub.write_if_changed(target_groups, groups))
        self.assertFalse(pub.write_if_changed(target_dir, directory))
        self.assertFalse(pub.write_if_changed(target_groups, groups))
        self.assertEqual(verify.check(self.root)['status'], 'verified')

    def test_excluded_notion_cannot_reappear_from_legacy(self):
        hidden = sync.project(page(name='Example Robotics', review='excluded'))
        directory, _groups, stats = pub.build(self.root, [hidden])
        self.assertEqual(stats['excluded_by_policy'], 1)
        self.assertEqual([x['name'] for x in directory['companies']], ['Legacy Vendor'])

    def test_drop_guard_for_published_directory(self):
        directory, groups, stats = pub.build(self.root, [sync.project(page())])
        self.write('companies-directory-v1.json', directory)
        self.write('company-country-groups.geojson', groups)
        previous = self.root / 'previous.json'
        previous.write_text(json.dumps({'total': 20}), encoding='utf-8')
        with self.assertRaisesRegex(AssertionError, 'collapsed'):
            verify.check(self.root, previous)


if __name__ == '__main__':
    unittest.main()
