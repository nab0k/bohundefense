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
ISO_DATE = re.compile(r"^(\d{4})-(\d{2})(?:-(\d{2}))?:")  # a date the pipeline left unformatted
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

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
    iso = ISO_DATE.match(line)
    if iso and 1 <= int(iso.group(2)) <= 12:  # "2025-09:" reads like its neighbours: "Sep 2025:"
        month = "%s %s:" % (MONTHS[int(iso.group(2)) - 1], iso.group(1))
        line = ("%d %s" % (int(iso.group(3)), month) if iso.group(3) else month) + line[iso.end():]
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


def says_something(line):
    """False for a line that is only a date or punctuation: nothing for the reader to check."""
    return bool(re.search(r"\w", line.split(":", 1)[1] if ":" in line else line))


# "Down the supply chain" (D-15, independent audit AUDIT_001): the pipeline builds these lines from extracted links
# and restrictions that the reviewing model does not read. A link whose side is empty ("None depends on ...") says
# nothing checkable; a restriction line carries no source of its own, and one of them turned a wind-load requirement
# into a tariff. Until each such line has a source, only a dependency with both sides named is shown.
EMPTY_SIDE = r"(?:none|n/?a|null|unknown|tbd|not specified|unspecified|[-—–?]*)"
DEPENDS = re.compile(r"^(.*?)\s+depends on\s+(.*)$", re.I)
EMPTY = re.compile(r"^" + EMPTY_SIDE + r"$", re.I)


def supply_line_ok(line):
    """True only for "<who> depends on <what>" with both sides named."""
    m = DEPENDS.match(" ".join(str(line).split()))
    if not m:
        return False
    who = m.group(1).strip(" .,:;")
    what = re.split(r"\s+[—–-]\s+", m.group(2), maxsplit=1)[0].strip(" .,:;")
    return not EMPTY.match(who) and not EMPTY.match(what)


REF = re.compile(r"\s*\[\d+(?:,\s*\d+)*\]")  # the same footnote marks the exporter strips from the text


def line_key(line):
    """A context line as the reader sees it: footnote marks and extra spaces do not separate two lines."""
    return " ".join(REF.sub("", str(line)).split())


def line_sources(context_sources):
    """{line: url} from the context_sources column (v21); entries without an https address are ignored."""
    out = {}
    for s in context_sources or []:
        if isinstance(s, dict) and isinstance(s.get("line"), str) and isinstance(s.get("url"), str) \
                and s["url"].startswith("https://"):
            out[line_key(s["line"])] = s["url"]
    return out


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
    pairs = [(line, by_line.get(line_key(line))) for line in lines]
    return [pair for pair in pairs if pair[1]]
