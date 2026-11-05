"""Reader-facing chronology lines: an honest stage and date (C3-11, EXP-032).

The pipeline stores each line as "<date>: <what> (<commitment>, <amount>)." The commitment comes from a model that
must pick a money status for every step, so it is often wrong and sometimes meaningless. Here the stage is read from
the words of the line alone; if they do not state one, no stage is shown. The first of a month is the pipeline's
filler for an unknown day, so it is not shown as a day.
"""
import re

RAW_STAGES = ("plan", "framework", "approval", "ceiling", "contract", "funded", "delivered", "site_selection",
              "other", "unveiling", "test", "evaluation")
TAIL = re.compile(r"\s*\((" + "|".join(RAW_STAGES) + r")?(?:,\s*)?([^()]*)\)\.?\s*$")
AMOUNT = re.compile(r"^(?:[A-Z]{3} )[\d.,]+ (?:thousand|million|billion|trillion)$")
FILLER_DAY = re.compile(r"^1 ([A-Z][a-z]{2}) (\d{4}):")

# Only the main clause counts: what follows these words is background, not the step itself.
BACKGROUND = re.compile(r"\b(?:following|after|targeting|pending|ahead of|in order to|alongside)\b", re.I)
# These steps name a stage without reaching it: a tender is not a contract, a paused project is not funded.
NO_STAGE = re.compile(r"\b(?:tenders?|solicitations?|cancell\w+|cancel\w*|paused|suspended|scrapp\w+|delayed)\b", re.I)

# First match wins: an intention outranks any later word in the line, and a handover the contract behind it.
RULES = (
    ("Plan", r"\b(?:will|would|plans? to|intends? to|expected to|scheduled|is set to|are set to|aims? to|evaluating"
             r"|interest in|considering|proposed|proposes)\b"),
    ("Delivered", r"\b(?:delivered|handed over|hands over|handover|hand-over|takes? delivery|took delivery"
                  r"|commissioned|enter(?:s|ed) (?:operational )?service)\b"),
    ("Funding", r"\b(?:funding round|investment round|seed round|series [a-e]|raises|raised|additional funding"
                r"|funded by)\b"),
    ("Testing", r"\b(?:trials?|tests|tested|test-fired|firings?|demonstrated|first flight|maiden flight)\b"),
    ("Contract", r"\b(?:contracts?|awarded|awards|purchase order|orders|places? an? [^,;]{0,40}order)\b"),
    ("Agreement", r"\b(?:agreements?|memorandum|mou|partnership|teaming)\b"),
    ("Approved", r"\b(?:approves|approved|authori[sz]ed|authori[sz]es|royal assent|ratified|ratifies"
                 r"|votes? [^,;]{0,40}in favou?r)\b"),
)
RULES = tuple((name, re.compile(pattern, re.I)) for name, pattern in RULES)


def stage_of(what):
    """The stage stated by the main clause of a line, or None when it states none or the line is in doubt."""
    if NO_STAGE.search(what):
        return None
    cut = BACKGROUND.search(what)
    main = what[:cut.start()] if cut else what
    for name, pattern in RULES:
        if pattern.search(main):
            return name
    return None


def clean_context_line(line):
    """Replace the stored tag with a stage the line supports, and drop a filler day."""
    line = " ".join(str(line).split())
    tag = TAIL.search(line)
    amount = None
    if tag and (tag.group(1) or AMOUNT.match((tag.group(2) or "").strip())):
        extra = (tag.group(2) or "").strip()
        amount = extra if AMOUNT.match(extra) else None  # "GBP 2.3" or "10" say nothing checkable
        line = line[:tag.start()]
    line = line.rstrip(" .")
    day = FILLER_DAY.match(line)
    if day:
        line = ("%s:" % day.group(2) if day.group(1) == "Jan" else "%s %s:" % (day.group(1), day.group(2))) \
            + line[day.end():]
    what = line.split(":", 1)[1] if ":" in line else line
    labels = [x for x in (stage_of(what), amount) if x]
    return line + (" (%s)" % ", ".join(labels) if labels else "") + "."


def split_sources(sources):
    """(sources listed under the material, {line text: url} for its context lines)."""
    listed, by_line = [], {}
    for s in sources or []:
        if isinstance(s, dict) and s.get("role") == "context":
            if isinstance(s.get("line"), str) and isinstance(s.get("url"), str) and s["url"].startswith("https://"):
                by_line[" ".join(s["line"].split())] = s["url"]
        else:
            listed.append(s)
    return listed, by_line


def context_links(lines, by_line):
    """[(line, url)]. A material published with line sources shows no line without one; older ones have none yet."""
    if not by_line:
        return [(line, None) for line in lines]
    pairs = [(line, by_line.get(" ".join(line.split()))) for line in lines]
    return [pair for pair in pairs if pair[1]]
