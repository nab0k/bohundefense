"""Run: python3 -m unittest discover -s scripts -p 'test_*.py'"""
import unittest
from company_mentions import build_index, mention_key, mentions

DIRECTORY = [
    {"name": "Rheinmetall AG", "country": "DE"},
    {"name": "KNDS Deutschland GmbH & Co. KG", "country": "DE"},
    {"name": "Thales Group", "country": "FR"},
    {"name": "THALES S.A.", "country": "FR"},
    {"name": "FORCIT", "country": "FI"},
    {"name": "Oy Forcit Ab", "country": "FI"},
    {"name": "Leonardo", "country": "IT"},
    {"name": "LEONARDO Società per azioni", "country": "IT"},
    {"name": "Contact", "country": "DE"},
    {"name": "Defence Systems Ltd", "country": "GB"},
    {"name": "Finland Oy", "country": "FI"},
]
PROFILES = {"oy-forcit-ab": {}}


def item(*lines):
    return {"title": "", "summary": "", "sections": [{"label": "What happened", "lines": list(lines)}]}


def found(*lines):
    items = [item(*lines)]
    return {(m["name"], tuple(m["text"])) for m in mentions(items[0], build_index(DIRECTORY, PROFILES, items))}


class Mentions(unittest.TestCase):
    def test_exact_name_and_possessive(self):
        self.assertEqual(found("Rheinmetall's new plant opens."), {("Rheinmetall AG", ("Rheinmetall",))})

    def test_trailing_ampersand_does_not_swallow_the_next_word(self):
        self.assertEqual(mention_key("KNDS Deutschland GmbH & Co. KG"), ("knds", "deutschland"))
        self.assertEqual(found("KNDS Deutschland and Rheinmetall sign."),
                         {("KNDS Deutschland GmbH & Co. KG", ("KNDS Deutschland",)), ("Rheinmetall AG", ("Rheinmetall",))})

    def test_longest_name_wins(self):
        self.assertEqual(found("Thales Group reported."), {("Thales Group", ("Thales Group",))})

    def test_shared_name_links_only_to_the_single_reviewed_card(self):
        self.assertEqual(found("Forcit supplies explosives."), {("Oy Forcit Ab", ("Forcit",))})
        self.assertEqual(found("Leonardo delivered."), set())  # two records, no card: no certain binding

    def test_lowercase_generic_and_place_names_are_not_linked(self):
        self.assertEqual(found("Contact the rheinmetall office."), set())
        self.assertEqual(found("Defence Systems in Finland grow."), set())


class FromNews(unittest.TestCase):
    def test_record_without_country_still_links(self):  # owner 23.11.2026: "from the news, not verified"
        directory = [{"name": "Saronic Technologies", "country": None, "status": "from_news"},
                     {"name": "Nowhere Systems Ltd", "country": None, "status": "unverified_candidate"}]
        items = [{"title": "Saronic Technologies and Nowhere Systems win a navy deal"}]
        got = mentions(items[0], build_index(directory, {}, items))
        self.assertEqual(got, [{"name": "Saronic Technologies", "country": "", "text": ["Saronic Technologies"]}])


if __name__ == "__main__":
    unittest.main()
