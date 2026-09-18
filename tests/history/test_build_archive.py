"""Synthetic test fixtures only; none is used to generate published data."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / 'scripts/history/build_archive.py'
SPEC = importlib.util.spec_from_file_location('build_archive', MODULE)
a = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(a)


def source(letter='a', stamp='2026-09-10T00:00:00Z'):
    return a.source_for(letter * 40, letter * 40, stamp, 'fixture capture')


def payload(**changes):
    provider = dict(name='Magnum 4D', drawDate='09-09-2026', drawNo='fixture',
                    first='0000', second='0123', third='9999',
                    special=['0042', '----', ''], consolation=['0007'])
    provider.update(changes)
    return {'drawDate': '01-01-1900', 'providers': {'magnum': provider}}


def record(**changes):
    return a.extract(payload(**changes), source())[0][0]


class ExtractionTests(unittest.TestCase):
    def test_zeroes_preserved_and_placeholders_excluded(self):
        records, counts = a.extract(payload(), source())
        self.assertEqual(records[0]['prizes'], dict(first='0000', second='0123', third='9999', special=['0042'], consolation=['0007']))
        self.assertEqual(counts['placeholder'], 2)

    def test_no_padding_trimming_unicode_or_numeric_coercion(self):
        records, counts = a.extract(payload(first=42, second='123', third='１２３４', special=[' 1234', '1234 ', '12345', '-123', '1e03', '0042'], consolation=[True, 1234, None, '----']), source())
        self.assertEqual(records[0]['prizes'], dict(first=None, second=None, third=None, special=['0042'], consolation=[]))
        self.assertEqual(counts['invalidNumber'], 10)

    def test_provider_date_not_global_date(self):
        self.assertEqual(record()['date'], '2026-09-09')

    def test_missing_date_never_uses_global(self):
        data = payload()
        del data['providers']['magnum']['drawDate']
        self.assertEqual(a.extract(data, source())[0], [])

    def test_bad_missing_and_future_dates(self):
        for value in ['31-02-2026', '2026-09-09', '9-9-2026', ' 09-09-2026', '11-09-2026', 20260909, None]:
            with self.subTest(value=value):
                self.assertEqual(a.extract(payload(drawDate=value), source())[0], [])

    def test_future_cutoff_is_malaysia_capture_day(self):
        result = a.extract(payload(drawDate='10-09-2026'), source(stamp='2026-09-09T17:00:00Z'))
        self.assertEqual(result[0][0]['date'], '2026-09-10')

    def test_whole_other_products_excluded_despite_four_digit_values(self):
        data = payload()
        data['providers'] = {key: dict(data['providers']['magnum']) for key in ['totoextra', 'damacai13d', 'unknown']}
        records, counts = a.extract(data, source())
        self.assertEqual(records, [])
        self.assertEqual(counts['excludedProductOrUnknownProvider'], 3)

    def test_mislabeled_non_4d_products_excluded(self):
        for name in ['Sports Toto 5D', 'Sports Toto 6D', 'Da Ma Cai 1+3D', 'Sabah 3D']:
            with self.subTest(name=name):
                self.assertEqual(a.extract(payload(name=name), source())[0], [])

    def test_nested_sabah_3d_is_never_collected(self):
        data = payload(threeD={'first': '1234', 'second': '5678'})
        data['providers']['sabah88'] = data['providers'].pop('magnum')
        data['providers']['sabah88']['name'] = 'Sabah88 4D'
        self.assertNotIn('1234', json.dumps(a.extract(data, source())[0]))

    def test_invalid_list_types_not_iterated(self):
        records, counts = a.extract(payload(special='1234', consolation={'first': '4321'}), source())
        self.assertEqual(records[0]['prizes']['special'], [])
        self.assertEqual(counts['invalidPrizeList'], 2)

    def test_empty_draw_skipped(self):
        records, counts = a.extract(payload(first=None, second='----', third='', special=[], consolation=[]), source())
        self.assertEqual(records, [])
        self.assertEqual(counts['emptyProviderDraw'], 1)

    def test_oversized_source_fields_fail_without_truncation(self):
        for changes in [dict(drawNo='x' * 61), dict(special=['1234'] * 31), dict(consolation=['1234'] * 31)]:
            with self.subTest(changes=changes), self.assertRaises(a.ArchiveError):
                a.extract(payload(**changes), source())

    def test_malformed_snapshot_fails(self):
        for value in [None, [], {}, {'providers': []}]:
            with self.assertRaises(a.ArchiveError):
                a.extract(value, source())


class MergeTests(unittest.TestCase):
    def test_empty_archive_has_null_dates(self):
        empty = a.make_archive([])
        a.validate_archive(empty)
        self.assertEqual(empty['coverage'], dict(to=None, drawCount=0, providerCount=0, snapshotCount=0, limited=True, **{'from': None}))

    def test_deterministic_order_and_coverage(self):
        result = a.make_archive([record(drawDate='08-09-2026'), record()])
        self.assertEqual([d['date'] for d in result['draws']], ['2026-09-09', '2026-09-08'])
        self.assertEqual(result['coverage']['snapshotCount'], 1)

    def test_new_data_replaces_whole_draw_and_reports_conflict(self):
        newer = record(first='4321', drawNo='corrected')
        newer['source'] = source('b', '2026-09-10T01:00:00Z')
        result, conflicts = a.merge(a.make_archive([record()]), [newer])
        self.assertEqual(result['draws'], [newer])
        self.assertEqual(conflicts[0]['changedCategories'], ['first'])
        self.assertTrue(conflicts[0]['drawNumberChanged'])

    def test_identical_values_do_not_churn_source_metadata(self):
        newer = record()
        newer['source'] = source('b', '2026-09-10T01:00:00Z')
        before = a.make_archive([record()])
        after, conflicts = a.merge(before, [newer])
        self.assertEqual(a.serialize(before), a.serialize(after))
        self.assertEqual(conflicts, [])

    def test_seed_uses_latest_equal_provenance(self):
        newer = record()
        newer['source'] = source('b', '2026-09-10T01:00:00Z')
        result, _ = a.merge(a.make_archive([record()]), [newer], replace_equal=True)
        self.assertEqual(result['draws'][0]['source'], newer['source'])

    def test_older_capture_cannot_overwrite_newer(self):
        newer = record()
        newer['source'] = source('b', '2026-09-10T01:00:00Z')
        before = a.make_archive([newer])
        after, _ = a.merge(before, [record(first='2222')])
        self.assertEqual(after, before)

    def test_malformed_existing_archive_rejected(self):
        valid = a.make_archive([record()])
        bad = []
        for field, value in [('schemaVersion', 2), ('coverage', {}), ('providers', [])]:
            case = copy.deepcopy(valid); case[field] = value; bad.append(case)
        case = copy.deepcopy(valid); case['draws'][0]['prizes']['first'] = 1234; bad.append(case)
        case = copy.deepcopy(valid); case['draws'][0]['date'] = '2026-02-31'; bad.append(case)
        case = copy.deepcopy(valid); case['draws'][0]['source']['url'] = 'https://unrelated.example/'; bad.append(case)
        case = copy.deepcopy(valid); case['draws'].append(copy.deepcopy(case['draws'][0])); bad.append(case)
        for case in bad:
            with self.assertRaises(a.ArchiveError):
                a.validate_archive(case)


class CommittedInputTests(unittest.TestCase):
    def test_reads_git_blob_not_working_tree_results(self):
        raw = json.dumps(payload()).encode()
        blob = a.hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
        calls = []
        def fake_git(repo, *args):
            calls.append(args)
            if args[0] == 'cat-file': return raw
            if args[0] == 'show': return b'2026-09-10T00:00:00Z\n'
            return ((blob if ':results.json' in args[-1] else 'a' * 40) + '\n').encode()
        with patch.object(a, 'git', side_effect=fake_git), patch.object(Path, 'read_bytes', side_effect=AssertionError('Working-tree read forbidden')):
            data, provenance = a.snapshot(Path('fixture'), 'HEAD')
        self.assertEqual(data, payload())
        self.assertEqual(provenance['blob'], blob)
        self.assertIn(('cat-file', 'blob', blob), calls)

    def test_bad_blob_digest_rejected(self):
        with patch.object(a, 'git', side_effect=[b'a' * 40, b'b' * 40, b'2026-09-10T00:00:00Z', b'{}']):
            with self.assertRaises(a.ArchiveError): a.snapshot(Path('fixture'), 'HEAD')

    def test_shallow_seed_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder, patch.object(a, 'git', return_value=b'true\n'):
            with self.assertRaises(a.ArchiveError): a.build(Path(folder), Path(folder) / 'archive.json', seed=True)

    def test_bad_existing_file_not_overwritten(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder) / 'archive.json'; output.write_bytes(b'{broken')
            with patch.object(a, 'git', side_effect=AssertionError('Validate archive before Git calls')):
                self.assertEqual(a.main(['--repo', folder, '--output', str(output)]), 1)
            self.assertEqual(output.read_bytes(), b'{broken')

    def test_incremental_second_run_byte_and_mtime_identical(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder, patch.object(a, 'snapshot', return_value=(payload(), source())):
            output = Path(folder) / 'archive.json'
            self.assertEqual(a.main(['--repo', folder, '--output', str(output)]), 0)
            raw, timestamp = output.read_bytes(), output.stat().st_mtime_ns
            self.assertEqual(a.main(['--repo', folder, '--output', str(output)]), 0)
            self.assertEqual(output.read_bytes(), raw)
            self.assertEqual(output.stat().st_mtime_ns, timestamp)

    def test_check_mode_does_not_write(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder, patch.object(a, 'snapshot', return_value=(payload(), source())):
            output = Path(folder) / 'archive.json'
            self.assertEqual(a.main(['--repo', folder, '--output', str(output), '--check']), 0)
            self.assertFalse(output.exists())

    def test_empty_production_archive_is_not_written(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder, patch.object(a, 'snapshot', return_value=({'providers': {}}, source())):
            output = Path(folder) / 'archive.json'
            self.assertEqual(a.main(['--repo', folder, '--output', str(output)]), 1)
            self.assertFalse(output.exists())

    def test_failed_atomic_replace_preserves_existing_file(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder) / 'archive.json'
            output.write_bytes(b'last known good')
            with patch.object(a.os, 'replace', side_effect=OSError('simulated replacement failure')):
                with self.assertRaises(OSError): a.write_if_changed(output, b'new data')
            self.assertEqual(output.read_bytes(), b'last known good')
            self.assertEqual(list(Path(folder).iterdir()), [output])

    def test_atomic_permission_denial_fails_once_without_retry_loop(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder) / 'archive.json'
            with patch.object(Path, 'open', side_effect=PermissionError('simulated denial')) as opened:
                with self.assertRaises(PermissionError): a.write_if_changed(output, b'new data')
            self.assertEqual(opened.call_count, 1)
            self.assertFalse(output.exists())

    def test_temporary_name_collision_never_removes_other_file(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder) / 'archive.json'
            collision = Path(folder) / '.archive.json.collision.tmp'
            collision.write_bytes(b'not owned by this write')
            with patch.object(a.uuid, 'uuid4') as identifier:
                identifier.return_value.hex = 'collision'
                with self.assertRaises(FileExistsError): a.write_if_changed(output, b'new data')
            self.assertEqual(collision.read_bytes(), b'not owned by this write')
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
