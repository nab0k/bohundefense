"""Run: python3 -m unittest discover -s scripts -p 'test_*.py'"""
import unittest
from synthesis_lines import clean_context_line, context_links, split_sources, stage_of


class Stage(unittest.TestCase):
    def test_words_decide_not_the_stored_tag(self):
        self.assertEqual(clean_context_line("15 Oct 2025: First pre-prototype is scheduled for handover (site_selection)."),
                         "15 Oct 2025: First pre-prototype is scheduled for handover (Plan).")
        self.assertEqual(clean_context_line("3 Dec 2025: First steel cutting at Appledore (funded)."),
                         "3 Dec 2025: First steel cutting at Appledore.")

    def test_a_named_step_short_of_the_stage_gets_none(self):
        for what in ("MoD publishes contract tender for three ships", "Project paused pending funding decision",
                     "Official reporting confirms the cancellation of the upgrade contract"):
            self.assertIsNone(stage_of(what))

    def test_background_clause_does_not_count(self):
        self.assertIsNone(stage_of("Work begins on the concept phase, following parliamentary approved plans"))

    def test_stages(self):
        for what, want in (("Italy places an initial EUR 73 million order with Rheinmetall", "Contract"),
                           ("Rheinmetall hands over the first Skynex", "Delivered"),
                           ("Sea trials commence", "Testing"), ("secures a seed round", "Funding"),
                           ("sign a framework agreement", "Agreement"), ("State Department approves a sale", "Approved")):
            self.assertEqual(stage_of(what), want, what)


class Tail(unittest.TestCase):
    def test_amount_kept_only_when_it_has_a_scale(self):
        self.assertEqual(clean_context_line("30 Apr 2026: Army awards a contract (contract, USD 716.248 million)."),
                         "30 Apr 2026: Army awards a contract (Contract, USD 716.248 million).")
        self.assertEqual(clean_context_line("Aug 2013: MoD places a contract (contract, GBP 2.3)."),
                         "Aug 2013: MoD places a contract (Contract).")
        self.assertEqual(clean_context_line("Jun 2026: Reports of interest in 10 aircraft (plan, 10)."),
                         "Jun 2026: Reports of interest in 10 aircraft (Plan).")

    def test_own_brackets_of_the_sentence_stay(self):
        self.assertEqual(clean_context_line("2024: The agency (DND) was founded"), "2024: The agency (DND) was founded.")

    def test_no_service_tag_survives(self):
        for tag in ("plan", "framework", "approval", "ceiling", "contract", "funded", "delivered", "site_selection"):
            self.assertNotIn(tag + ")", clean_context_line("2020: Something happened (%s)." % tag))


class Dates(unittest.TestCase):
    def test_filler_day_goes(self):
        self.assertTrue(clean_context_line("1 Jan 1980: Company is founded (plan).").startswith("1980: "))
        self.assertTrue(clean_context_line("1 Mar 2025: Coalition is proposed (plan).").startswith("Mar 2025: "))

    def test_real_day_stays(self):
        self.assertTrue(clean_context_line("11 Mar 2025: x (plan).").startswith("11 Mar 2025: "))
        self.assertTrue(clean_context_line("21 Mar 2025: x (plan).").startswith("21 Mar 2025: "))


class Links(unittest.TestCase):
    SOURCES = [{"url": "https://a.example/n", "outlet": "A"},
               {"role": "context", "line": "2020: One  (plan).", "url": "https://b.example/1"},
               {"role": "context", "line": "2021: Bad.", "url": "http://b.example/2"}]

    def test_split(self):
        listed, by_line = split_sources(self.SOURCES)
        self.assertEqual([s["url"] for s in listed], ["https://a.example/n"])
        self.assertEqual(by_line, {"2020: One (plan).": "https://b.example/1"})

    def test_line_without_source_hidden_when_material_has_line_sources(self):
        _, by_line = split_sources(self.SOURCES)
        self.assertEqual(context_links(["2020: One (plan).", "2021: Bad."], by_line),
                         [("2020: One (plan).", "https://b.example/1")])

    def test_older_material_keeps_its_lines(self):
        self.assertEqual(context_links(["2020: One."], {}), [("2020: One.", None)])


class ColumnLinks(unittest.TestCase):
    def test_line_sources_from_column(self):
        from synthesis_lines import line_sources
        got = line_sources([{"line": "2025: B [2].", "url": "https://b.example/2"},
                            {"line": "2026: C.", "url": "http://insecure.example"}, "junk"])
        self.assertEqual(got, {"2025: B.": "https://b.example/2"})

    def test_footnote_mark_does_not_hide_a_linked_line(self):
        from synthesis_lines import line_sources
        by_line = line_sources([{"line": "2025: B [2].", "url": "https://b.example/2"}])
        self.assertEqual(context_links(["2025: B."], by_line), [("2025: B.", "https://b.example/2")])


if __name__ == "__main__":
    unittest.main()
