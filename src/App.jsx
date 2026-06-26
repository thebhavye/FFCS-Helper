import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { schools } from "./data/schools.js";
import {
  conflictsWithSelection,
  slotBundles,
  splitSlotCode,
  timetableRows
} from "./logic/slots.js";
import {
  buildSubjectOptions,
  explainTimetableConflicts,
  findSubjectBlockers,
  solveTimetables
} from "./logic/solver.js";

const typeLabels = {
  theory: "Theory Only",
  theory_lab: "Theory + Lab",
  integrated: "Integrated"
};

const priorityLabels = {
  important: "Important",
  flexible: "Flexible"
};

const flexibleCourseCodes = new Set([
  "BARB101L",
  "BCHI101L",
  "BESP101L",
  "BFRE101L",
  "BGER101L",
  "BHUM102E",
  "BCLE212L",
  "BCLE215L",
  "BCLE216L",
  "BHUM103L",
  "BHUM104L",
  "BHUM106L",
  "BHUM107L",
  "BHUM108L",
  "BHUM109L",
  "BJAP101L",
  "BHUM111L",
  "BHUM216L"
]);

const flexibleCourseKeywords = [
  "arabic",
  "chinese",
  "spanish",
  "french",
  "german",
  "japanese",
  "indian classical music",
  "natural disaster mitigation",
  "waste management",
  "water resource management",
  "micro economics",
  "macro economics",
  "principles of sociology",
  "sustainability and society",
  "urban community development",
  "social work and sustainability",
  "happiness and well-being",
  "indian culture and heritage"
];

const getDefaultPriority = (subject) => {
  const code = subject?.code || "";
  const searchableText = `${subject?.code || ""} ${subject?.name || ""}`.toLowerCase();

  if (flexibleCourseCodes.has(code)) {
    return "flexible";
  }

  if (flexibleCourseKeywords.some((keyword) => searchableText.includes(keyword))) {
    return "flexible";
  }

  return "important";
};

const isLabSlotGroup = (group) =>
  group.slots.length > 0 && group.slots.every((slot) => slot.startsWith("L"));

const getSlotRequirementWarnings = (selectedSubjects, selectedSlotGroups) => {
  const selectedTheoryGroups = selectedSlotGroups.filter((group) => !isLabSlotGroup(group)).length;
  const selectedLabGroups = selectedSlotGroups.filter(isLabSlotGroup).length;
  const theoryCourseCount = selectedSubjects.length;
  const labCourseCount = selectedSubjects.filter((subject) => subject.type !== "theory").length;
  const warnings = [];

  if (selectedTheoryGroups < theoryCourseCount) {
    warnings.push({
      type: "theory",
      selected: selectedTheoryGroups,
      needed: theoryCourseCount,
      message: `You selected ${selectedTheoryGroups} theory slot group(s), but added ${theoryCourseCount} course(s). Select at least ${theoryCourseCount} theory slot group(s).`
    });
  }

  if (selectedLabGroups < labCourseCount) {
    warnings.push({
      type: "lab",
      selected: selectedLabGroups,
      needed: labCourseCount,
      message: `You selected ${selectedLabGroups} lab slot pair(s), but added ${labCourseCount} theory + lab course(s). Select at least ${labCourseCount} lab slot pair(s).`
    });
  }

  return warnings;
};

const plural = (count, singular, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

const formatSlotRequirementMessage = (warning) => {
  const missing = warning.needed - warning.selected;
  const slotLabel = warning.type === "lab" ? "lab slot pair" : "theory slot group";
  const courseLabel = warning.type === "lab" ? "lab course" : "course";

  return `Select ${missing} more ${plural(missing, slotLabel)}. You added ${warning.needed} ${plural(warning.needed, courseLabel)}, but selected only ${warning.selected} ${plural(warning.selected, slotLabel)}.`;
};

const subjectTypeOptions = [
  { value: "theory", label: "Theory Only" },
  { value: "theory_lab", label: "Theory + Lab" }
];

const theoryHeadings = [
  "8:00 AM\nto\n8:50 AM",
  "9:00 AM\nto\n9:50 AM",
  "10:00 AM\nto\n10:50 AM",
  "11:00 AM\nto\n11:50 AM",
  "12:00 PM\nto\n12:50 PM",
  "2:00 PM\nto\n2:50 PM",
  "3:00 PM\nto\n3:50 PM",
  "4:00 PM\nto\n4:50 PM",
  "5:00 PM\nto\n5:50 PM",
  "6:00 PM\nto\n6:50 PM"
];

const labHeadings = [
  { label: "8:00 AM\nto\n9:40 AM", span: 2 },
  { label: "9:51 AM\nto\n11:30 AM", span: 2 },
  { label: "11:40 AM\nto\n1:20 PM", span: 1 },
  { label: "2:00 PM\nto\n3:40 PM", span: 2 },
  { label: "3:51 PM\nto\n5:30 PM", span: 2 },
  { label: "5:40 PM\nto\n7:20 PM", span: 1 }
];

const labColSpans = [2, 2, 1, 2, 2, 1];

const formatSlotLabel = (label) => label.replace(/\s+\+\s+/g, "+");
const formatSlotGroup = (slots) => (slots || []).filter(Boolean).join("+");

function SlotPopover({ code, anchorRef, onSelect, onClose }) {
  const ref = useRef(null);
  const bundles = slotBundles[code];
  const [pos, setPos] = useState({ top: 8, left: 8 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = ref.current;
    if (!anchor || !popover) return;

    const placePopover = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const gap = 8;
      const margin = 8;
      const belowTop = anchorRect.bottom + gap;
      const aboveTop = anchorRect.top - popoverRect.height - gap;
      const fitsBelow = belowTop + popoverRect.height <= window.innerHeight - margin;
      const top = Math.max(margin, fitsBelow ? belowTop : aboveTop);
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
      const maxLeft = Math.max(margin, window.innerWidth - popoverRect.width - margin);
      const left = Math.min(Math.max(margin, centeredLeft), maxLeft);

      setPos({ top, left });
    };

    placePopover();

    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchorRef, onClose]);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  if (!bundles) return null;

  return (
    <div
      className="slot-popover slot-popover-portal"
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999
      }}
    >
      <p className="popover-label">Select {code} as:</p>
      {bundles.map(([label, slots]) => (
        <button
          key={label}
          type="button"
          className="popover-option"
          onClick={() => { onSelect(slots, label); onClose(); }}
        >
          {label}
        </button>
      ))}
      <button type="button" className="popover-cancel" onClick={onClose}>Cancel</button>
    </div>
  );
}

function SlotCell({ code, selectedSlots, onToggle, colSpan }) {
  const [showPopover, setShowPopover] = useState(false);
  const cellRef = useRef(null);

  if (!/[A-Z]+\d/.test(code)) {
    return <td className="slot-cell empty-cell" colSpan={colSpan}><span>-</span></td>;
  }

  const parts = splitSlotCode(code);
  const isSelected = parts.every((s) => selectedSlots.includes(s));
  const isDisabled = !isSelected && conflictsWithSelection(code, selectedSlots);
  const isLab = code.startsWith("L");
  const hasBundles = !isLab && slotBundles[code];

  const className = [
    "slot-cell",
    isLab ? "lab-cell" : "theory-cell",
    isSelected ? "selected" : "",
    isDisabled ? "disabled" : ""
  ].filter(Boolean).join(" ");

  const handleClick = () => {
    if (isDisabled) return;
    if (isSelected) {
      onToggle(parts, false);
      return;
    }
    if (hasBundles) {
      setShowPopover(true);
    } else {
      onToggle(parts, true);
    }
  };

  return (
    <td className={className} ref={cellRef} colSpan={colSpan}>
      <button type="button" onClick={handleClick}>{code}</button>
      {showPopover && (
        <SlotPopover
          code={code}
          anchorRef={cellRef}
          onSelect={(slots, label) => onToggle(slots, true, label)}
          onClose={() => setShowPopover(false)}
        />
      )}
    </td>
  );
}

function facultyTheoryPreview(faculty) {
  const slots = faculty.slots || faculty.theorySlots || [];
  const room = faculty.room || faculty.theoryRoom || "";
  return [slots.join("+"), room, faculty.name].filter(Boolean).join(" ");
}

function facultyLabPreview(faculty) {
  const slots = faculty.labSlots || [];
  const room = faculty.labRoom || "";
  return [slots.join("+"), room, faculty.name].filter(Boolean).join(" ");
}

function FacultyChecklist({
  title,
  faculty,
  selectedIds,
  disabled = false,
  isValid,
  getPreview,
  onToggle,
  onSelectAll
}) {
  const allSelected = faculty.length > 0 && faculty.every((fac) => selectedIds.includes(fac.id));

  return (
    <div className={`faculty-box${disabled ? " faculty-box-disabled" : ""}`}>
      <div className="faculty-heading">{title}</div>
      <label className="faculty-select-all">
        <input
          type="checkbox"
          disabled={disabled || faculty.length === 0}
          checked={!disabled && allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
        <strong>Select all</strong>
      </label>
      <div className="faculty-list">
        {faculty.length ? faculty.map((fac) => {
          const valid = isValid(fac);
          return (
            <label
              key={fac.id}
              className={`faculty-option${valid ? " faculty-valid" : ""}`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={!disabled && selectedIds.includes(fac.id)}
                onChange={() => onToggle(fac.id)}
              />
              <span>{getPreview(fac)}</span>
              {valid && <span className="valid-badge">OK</span>}
            </label>
          );
        }) : (
          <p className="empty-text">No faculty available.</p>
        )}
      </div>
    </div>
  );
}

function App() {
  const [schoolCode, setSchoolCode] = useState("SCOPE");
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectType, setSubjectType] = useState("theory");
  const [selectedTheoryFacultyIds, setSelectedTheoryFacultyIds] = useState([]);
  const [selectedLabFacultyIds, setSelectedLabFacultyIds] = useState([]);
  const [selectedSlotGroups, setSelectedSlotGroups] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [results, setResults] = useState([]);
  const [conflictExplanations, setConflictExplanations] = useState([]);
  const [blockerSuggestions, setBlockerSuggestions] = useState([]);
  const [message, setMessage] = useState("Select slots, configure a course, then add it.");
  const appRef = useRef(null);

  const school = schools[schoolCode];
  const allSubjects = school?.subjects || [];
  const currentSubject = allSubjects.find((s) => s.code === subjectCode);
  const selectedSubjectCodes = new Set(selectedSubjects.map((s) => s.code));
  const selectedSlots = useMemo(
    () => Array.from(new Set(selectedSlotGroups.flatMap((group) => group.slots))),
    [selectedSlotGroups]
  );
  const slotRequirementWarnings = useMemo(
    () => getSlotRequirementWarnings(selectedSubjects, selectedSlotGroups),
    [selectedSubjects, selectedSlotGroups]
  );
  const needsLab = subjectType !== "theory";
  const theoryFaculty = (currentSubject?.faculty || []).filter(
    (faculty) => (faculty.slots || faculty.theorySlots || []).length > 0
  );
  const labFaculty = (currentSubject?.faculty || []).filter((faculty) => (faculty.labSlots || []).length > 0);

  const validFacultyPreview = useMemo(() => {
    if (!currentSubject) return [];
    return buildSubjectOptions(
      currentSubject,
      selectedTheoryFacultyIds,
      selectedSlots,
      subjectType,
      selectedLabFacultyIds
    );
  }, [currentSubject, selectedTheoryFacultyIds, selectedLabFacultyIds, selectedSlots, subjectType]);

  const handleSlotToggle = (slots, adding, label = slots.join("+")) => {
    setSelectedSlotGroups((current) => {
      if (!adding) {
        return current.filter((group) => !group.slots.some((slot) => slots.includes(slot)));
      }

      const next = current.filter((group) => !group.slots.some((slot) => slots.includes(slot)));
      return [...next, { label: formatSlotLabel(label), slots }];
    });
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage("Slots updated.");
  };

  const resetSlots = () => {
    setSelectedSlotGroups([]);
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage("Slots reset.");
  };

  const resetCourses = () => {
    setSelectedSubjects([]);
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage("Selected courses reset.");
  };

  const toggleTheoryFaculty = (id) => {
    setSelectedTheoryFacultyIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const toggleLabFaculty = (id) => {
    setSelectedLabFacultyIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const setAllTheoryFaculty = (checked) => {
    setSelectedTheoryFacultyIds(checked ? theoryFaculty.map((f) => f.id) : []);
  };

  const setAllLabFaculty = (checked) => {
    setSelectedLabFacultyIds(checked ? labFaculty.map((f) => f.id) : []);
  };

  const changeSchool = (code) => {
    setSchoolCode(code);
    setSubjectCode("");
    setSubjectType("theory");
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
  };

  const changeSubject = (code) => {
    setSubjectCode(code);
    const subject = allSubjects.find((s) => s.code === code);
    setSubjectType(subject?.type === "theory" ? "theory" : "theory_lab");
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
  };

  const changeSubjectType = (type) => {
    setSubjectType(type);
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
  };

  const isTheoryFacultyValid = (faculty) => {
    const slots = faculty.slots || faculty.theorySlots || [];
    return slots.length > 0 && slots.every((slot) => selectedSlots.includes(slot));
  };

  const isLabFacultyValid = (faculty) => {
    const slots = faculty.labSlots || [];
    return slots.length > 0 && slots.every((slot) => selectedSlots.includes(slot));
  };

  const addSubject = () => {
    if (!currentSubject) { setMessage("Choose a subject first."); return; }
    if (selectedSubjectCodes.has(currentSubject.code)) { setMessage("Already added."); return; }
    if (!selectedSlots.length) { setMessage("Select slots before adding a course."); return; }
    if (!selectedTheoryFacultyIds.length) { setMessage("Select at least one theory faculty."); return; }
    if (needsLab && !selectedLabFacultyIds.length) { setMessage("Select at least one lab faculty."); return; }

    const options = buildSubjectOptions(
      currentSubject,
      selectedTheoryFacultyIds,
      selectedSlots,
      subjectType,
      selectedLabFacultyIds
    );
    if (!options.length) {
      setMessage("No selected faculty fit within your chosen slots.");
      return;
    }

    setSelectedSubjects((cur) => [
      ...cur,
      {
        code: currentSubject.code,
        name: currentSubject.name,
        type: subjectType,
        priority: getDefaultPriority(currentSubject),
        options
      }
    ]);
    setSubjectCode("");
    setSubjectType("theory");
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage(`${currentSubject.name} added - ${options.length} valid option(s).`);
  };

  const removeSubject = (code) => {
    setSelectedSubjects((cur) => cur.filter((s) => s.code !== code));
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
  };

  const changeSubjectPriority = (code, priority) => {
    setSelectedSubjects((cur) =>
      cur.map((subject) =>
        subject.code === code ? { ...subject, priority } : subject
      )
    );
    setResults([]);
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage(`${priorityLabels[priority]} preference saved.`);
  };

  const generate = () => {
    if (!selectedSubjects.length) { setMessage("Add at least one course."); return; }
    if (slotRequirementWarnings.length) {
      setResults([]);
      setConflictExplanations([]);
      setBlockerSuggestions([]);
      setMessage(formatSlotRequirementMessage(slotRequirementWarnings[0]));
      return;
    }
    const { results: solved, stoppedEarly } = solveTimetables(selectedSubjects);
    const blockers = solved.length ? [] : findSubjectBlockers(selectedSubjects);
    const conflicts = solved.length || blockers.length ? [] : explainTimetableConflicts(selectedSubjects);
    setResults(solved);
    setConflictExplanations(conflicts);
    setBlockerSuggestions(blockers);
    setMessage(
      solved.length
        ? `Found ${solved.length} clash-free timetable(s).`
        : stoppedEarly
          ? "Search stopped early. Check the blocker hints below, then narrow choices and try again."
          : conflicts.length
            ? "No clash-free timetable possible. Check the blocker hints below."
            : "No clash-free timetable possible with these courses."
    );
  };

  return (
    <main className="app-shell" id="app" ref={appRef}>
      <section className="panel timetable-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Step 01</p>
            <h2>Select Slots</h2>
          </div>
          <button className="ghost-button" type="button" onClick={resetSlots}>Reset Slots</button>
        </div>

        <div className="selected-strip">
          {selectedSlotGroups.length
            ? selectedSlotGroups.map((group) => <span key={group.label}>{group.label}</span>)
            : <span className="muted-strip">No slots selected yet</span>}
        </div>

        <div className="table-scroll">
          <table className="timetable">
            <thead>
              <tr>
                <th>Theory Hours</th>
                {theoryHeadings.map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
              <tr>
                <th>Lab Hours</th>
                {labHeadings.map((heading) => (
                  <th key={heading.label} colSpan={heading.span}>{heading.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timetableRows.map((row) => (
                <Fragment key={row.day}>
                  <tr>
                    <th rowSpan="2">{row.day}</th>
                    {row.theory.map((code, i) => (
                      <SlotCell
                        key={`${row.day}-theory-${i}`}
                        code={code}
                        selectedSlots={selectedSlots}
                        onToggle={handleSlotToggle}
                      />
                    ))}
                  </tr>
                  <tr>
                    {row.lab.map((code, i) => (
                      <SlotCell
                        key={`${row.day}-lab-${i}`}
                        code={code}
                        colSpan={labColSpans[i]}
                        selectedSlots={selectedSlots}
                        onToggle={handleSlotToggle}
                      />
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="config-grid">
        <section className="panel course-config-panel">
          <h1 className="panel-title">Course Configuration</h1>

          <label className="field">
            <span>Subject Domain</span>
            <select value={schoolCode} onChange={(e) => changeSchool(e.target.value)}>
              {Object.keys(schools).map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Subject Name</span>
            <select value={subjectCode} onChange={(e) => changeSubject(e.target.value)}>
              <option value="">Select subject</option>
              {allSubjects.map((subject) => (
                <option
                  key={subject.code}
                  value={subject.code}
                  disabled={selectedSubjectCodes.has(subject.code)}
                >
                  {subject.name}{selectedSubjectCodes.has(subject.code) ? " (added)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Subject Type</span>
            <select
              value={subjectType}
              disabled={!currentSubject}
              onChange={(e) => changeSubjectType(e.target.value)}
            >
              {subjectTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <FacultyChecklist
            title="Faculty (Theory)"
            faculty={theoryFaculty}
            selectedIds={selectedTheoryFacultyIds}
            isValid={isTheoryFacultyValid}
            getPreview={facultyTheoryPreview}
            onToggle={toggleTheoryFaculty}
            onSelectAll={setAllTheoryFaculty}
          />

          <FacultyChecklist
            title="Faculty (Lab)"
            faculty={labFaculty}
            selectedIds={selectedLabFacultyIds}
            disabled={!needsLab}
            isValid={isLabFacultyValid}
            getPreview={facultyLabPreview}
            onToggle={toggleLabFaculty}
            onSelectAll={setAllLabFaculty}
          />

          <p className="hint">
            {validFacultyPreview.length} option(s) match your selected slots.
          </p>

          <button className="primary-button" type="button" onClick={addSubject}>
            Add Course
          </button>
        </section>

        <section className="panel selected-courses-panel">
          <div className="panel-header">
            <h2 className="panel-title">Selected Courses</h2>
            <button className="ghost-button" type="button" onClick={resetCourses}>Reset</button>
          </div>

          <div className="selected-course-list">
            {selectedSubjects.length ? selectedSubjects.map((subject) => (
              <article key={subject.code} className="selected-course-card">
                <dl>
                  <div>
                    <dt>Subject</dt>
                    <dd>{subject.name}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{typeLabels[subject.type] || subject.type}</dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>
                      <select
                        className="priority-select"
                        value={subject.priority || "important"}
                        onChange={(e) => changeSubjectPriority(subject.code, e.target.value)}
                      >
                        <option value="important">Important</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </dd>
                  </div>
                </dl>
                <button type="button" className="delete-button" onClick={() => removeSubject(subject.code)}>
                  Delete
                </button>
              </article>
            )) : (
              <p className="empty-text">No courses added yet.</p>
            )}
          </div>

          {slotRequirementWarnings.length > 0 && (
            <div className="slot-warning-list">
              {slotRequirementWarnings.map((warning) => (
                <article key={warning.type} className="slot-warning-card">
                  <div className="slot-warning-label">
                    {warning.type === "lab" ? "More lab slots needed" : "More theory slots needed"}
                  </div>
                  <p>{formatSlotRequirementMessage(warning)}</p>
                </article>
              ))}
            </div>
          )}

          <button className="primary-button generate-btn" type="button" onClick={generate}>
            Generate Timetables
          </button>
        </section>
      </section>

      <section className="panel results-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Output</p>
            <h2>Generated Timetables</h2>
          </div>
          <span className="message-pill">{message}</span>
        </div>

        {blockerSuggestions.length > 0 && (
          <div className="blocker-list">
            {blockerSuggestions.map((blocker) => (
              <article key={blocker.subject} className="blocker-card">
                <div className="blocker-label">
                  Likely blocker - {priorityLabels[blocker.priority] || "Important"}
                </div>
                <p>
                  {blocker.noValidOptions ? (
                    <>
                      <strong>{blocker.subject}</strong> has no selected faculty option that matches the chosen slots.
                      For theory + lab subjects, select both its theory slots and one complete lab slot pair.
                    </>
                  ) : (
                    <>
                      Removing <strong>{blocker.subject}</strong>
                      {blocker.uncertain
                        ? " may help, but the remaining search was still too broad to confirm."
                        : ` allows at least ${blocker.remainingResults} timetable(s) with the other selected courses.`}
                      {blocker.clashesWithEveryOtherSubject
                        ? " It clashes with every other selected course."
                        : ` It clashes with ${blocker.clashCount} of ${blocker.totalOtherSubjects} other selected course(s).`}
                    </>
                  )}
                </p>
                {blocker.clashDetails?.length > 0 && (
                  <div className="blocker-detail-list">
                    <div className="blocker-detail-heading">
                      {blocker.subject} clashes with:
                    </div>
                    {blocker.clashDetails.map((detail, index) => (
                      <div
                        key={`${detail.subject}-${detail.slotA}-${detail.slotB}-${index}`}
                        className="blocker-detail"
                      >
                        <div className="blocker-detail-subject">{detail.subject}</div>
                        <div className="blocker-detail-slots">
                          <span>{blocker.subject}: {detail.slotA}</span>
                          <span>{detail.subject}: {detail.slotB}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {results.length ? (
          <div className="results-grid">
            {results.map((schedule, idx) => (
              <article key={idx} className="result-card">
                <div className="result-card-header">
                  <span className="result-index">#{idx + 1}</span>
                  <span className="result-count">{schedule.length} course(s)</span>
                </div>
                {schedule.map((entry) => (
                  <div key={`${entry.subjectCode}-${entry.facultyName}`} className="result-row">
                    <div className="result-subject">{entry.subjectName}</div>
                    <div className="result-faculty">{entry.facultyName}</div>
                    {entry.type === "theory" ? (
                      <div className="result-slots">
                        <span className="slot-tag theory-tag">Theory</span>
                        <span className="slot-chip">{formatSlotGroup(entry.slots)}</span>
                        {entry.room && <span className="room-chip">{entry.room}</span>}
                      </div>
                    ) : (
                      <div className="result-slots">
                        <span className="slot-tag theory-tag">Theory</span>
                        <span className="slot-chip">{formatSlotGroup(entry.theorySlots)}</span>
                        {entry.theoryRoom && <span className="room-chip">{entry.theoryRoom}</span>}
                        <span className="slot-tag lab-tag">Lab</span>
                        <span className="slot-chip">{formatSlotGroup(entry.labSlots)}</span>
                        {entry.labRoom && <span className="room-chip">{entry.labRoom}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : conflictExplanations.length ? (
          <div className="conflict-list">
            {conflictExplanations.map((conflict, index) => (
              <article key={`${conflict.optionA}-${conflict.optionB}-${index}`} className="conflict-card">
                <div className="conflict-subjects">
                  <span>{conflict.subjectA}</span>
                  <span>clashes with</span>
                  <span>{conflict.subjectB}</span>
                </div>
                <p>
                  <strong>{conflict.optionA}</strong>
                  {" "}
                  slot <span className="slot-chip">{conflict.slotA}</span>
                  {" "}clashes with{" "}
                  <strong>{conflict.optionB}</strong>
                  {" "}
                  slot <span className="slot-chip">{conflict.slotB}</span>.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-text results-empty">Generated timetables will appear here after you click Generate.</p>
        )}
      </section>
    </main>
  );
}

export default App;
