import importlib.util
from unittest.mock import patch
import copy
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

    def test_every_notional_field_kept_typed_and_private(self):
        src = page()
        src['created_time'] = '2026-10-20T12:00:00.000Z'
        src['properties']['Confidence'] = {'type': 'select', 'id': 'confidence',
                                           'select': {'name': 'medium', 'id': 'opt-1'}}
        src['properties']['A — Домены'] = {'type': 'multi_select', 'id': 'domain',
                                          'multi_select': [{'name': 'AIR'}, {'name': 'LAND'}]}
        src['properties']['Checked'] = {'type': 'date', 'id': 'checked',
                                        'date': {'start': '2026-10-22', 'end': None}}
        src['properties']['Reason / note'] = {'type': 'rich_text', 'id': 'reason',
                                             'rich_text': [{'plain_text': 'PRIVATE DO NOT PUBLISH'}]}
        projected = sync.project(src)
        snapshot = projected['notion_page']
        self.assertEqual(snapshot['properties'], src['properties'])
        self.assertEqual(snapshot['created_time'], src['created_time'])
        self.assertEqual(snapshot['properties']['Checked']['date']['start'], '2026-10-22')
        src['properties']['Confidence']['select']['name'] = 'low'
        self.assertEqual(snapshot['properties']['Confidence']['select']['name'], 'medium')
        directory, _, _ = pub.build(self.root, [projected])
        result = json.dumps(directory, ensure_ascii=False)
        self.assertNotIn('PRIVATE DO NOT PUBLISH', result)
        self.assertNotIn('notion_page', result)
        self.assertNotIn('created_time', result)

    def test_hidden_field_change_changes_full_payload_digest(self):
        src = page()
        src['properties']['Confidence'] = {'type': 'select', 'select': {'name': 'high'}}
        old = sync.project(src)
        new = copy.deepcopy(src)
        new['properties']['Confidence']['select']['name'] = 'low'
        self.assertNotEqual(sync.source_digest(old), sync.source_digest(sync.project(new)))
        self.assertEqual(old['name'], sync.project(new)['name'])

    def test_missing_notion_column_fails_closed(self):
        src = page()
        def fake(token, method, path, body=None):
            if method == 'GET' and path.startswith('/data_sources/'):
                return {'properties': {'Name': {}, 'Country': {}, 'Missing': {}}}
            return {'results': [src], 'has_more': False}
        with patch.object(sync, 'notion_request', side_effect=fake):
            with self.assertRaisesRegex(RuntimeError, 'property coverage'):
                sync.request_pages('dummy-token', 'dummy-source', pause=0)

    def test_long_property_items_are_paginated_and_retained(self):
        src = page()
        src['properties']['About (EN)'] = {'type': 'rich_text', 'id': 'encoded%name',
            'rich_text': [{'plain_text': str(i)} for i in range(25)]}
        all_items = [{'object': 'property_item', 'type': 'rich_text',
                      'rich_text': {'plain_text': str(i)}} for i in range(27)]
        calls = []
        def fake(token, method, path, body=None):
            calls.append((method, path))
            if 'start_cursor=next' in path:
                return {'object': 'list', 'results': all_items[25:], 'has_more': False}
            return {'object': 'list', 'results': all_items[:25],
                    'has_more': True, 'next_cursor': 'next'}
        with patch.object(sync, 'notion_request', side_effect=fake):
            output = sync.expand_large_properties(src, 'dummy-token', pause=0)
        prop = output['properties']['About (EN)']
        self.assertEqual(len(prop['rich_text']), 27)
        self.assertEqual(len(prop['full_property_items']), 27)
        self.assertEqual(sync.rich(prop), ''.join(str(i) for i in range(27)))
        self.assertEqual(len(calls), 2)
        self.assertIn('encoded%25name', calls[0][1])

    def test_all_notion_schema_columns_confirmed_on_real_request_path(self):
        src = page()
        def fake(token, method, path, body=None):
            if method == 'GET':
                return {'properties': {k: {'type': v['type']} for k, v in src['properties'].items()}}
            self.assertEqual(body['page_size'], 100)
            return {'results': [src], 'has_more': False}
        with patch.object(sync, 'notion_request', side_effect=fake):
            rows = sync.request_pages('dummy-token', 'dummy-source', pause=0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(sync.project(rows[0])['notion_page']['properties'], src['properties'])

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
