import React, { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { schools } from "./data/schools.js";
import {
  conflictsWithSelection,
  isClash,
  slotBundles,
  slotTimes,
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

function StepOverview({ slotsCount, coursesCount, hasResults, onJump }) {
  const steps = [
    {
      num: "01",
      title: "Select Slots",
      desc: "Click time slots on the grid to mark when you're free",
      done: slotsCount > 0,
      active: slotsCount === 0,
      status: slotsCount > 0 ? `${slotsCount} slot${slotsCount !== 1 ? "s" : ""} selected` : "No slots yet"
    },
    {
      num: "02",
      title: "Add Courses",
      desc: "Pick a subject, choose faculty, then hit Add Course",
      done: coursesCount > 0,
      active: slotsCount > 0 && coursesCount === 0,
      status: coursesCount > 0 ? `${coursesCount} course${coursesCount !== 1 ? "s" : ""} added` : "No courses yet"
    },
    {
      num: "03",
      title: "Generate",
      desc: "Hit Generate Timetables and see clash-free options",
      done: hasResults,
      active: coursesCount > 0 && !hasResults,
      status: hasResults ? "Done! Timetables ready" : "Waiting for courses"
    }
  ];

  return (
    <div className="step-overview">
      {steps.map((step, idx) => (
        <button
          key={step.num}
          type="button"
          className={`step-card ${step.done ? "step-done" : step.active ? "step-active" : "step-idle"}`}
          onClick={() => onJump(idx)}
        >
          <div className="step-card-top">
            <span className="step-num">{step.num}</span>
            {step.done && <span className="step-check">✓</span>}
          </div>
          <div className="step-card-title">{step.title}</div>
          <div className="step-card-desc">{step.desc}</div>
          <div className="step-card-status">{step.status}</div>
        </button>
      ))}
    </div>
  );
}

function App() {
  const [schoolCode, setSchoolCode] = useState("SCOPE");
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectType, setSubjectType] = useState("theory");
  const [allowDifferentTeachers, setAllowDifferentTeachers] = useState(false);
  const [selectedTheoryFacultyIds, setSelectedTheoryFacultyIds] = useState([]);
  const [selectedLabFacultyIds, setSelectedLabFacultyIds] = useState([]);
  const [selectedSlotGroups, setSelectedSlotGroups] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [results, setResults] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [conflictExplanations, setConflictExplanations] = useState([]);
  const [blockerSuggestions, setBlockerSuggestions] = useState([]);
  const [message, setMessage] = useState("Select slots, configure a course, then add it.");
  const [autoSlotNotice, setAutoSlotNotice] = useState(null);
  const appRef = useRef(null);
  const slotsPanelRef = useRef(null);
  const coursePanelRef = useRef(null);
  const resultsPanelRef = useRef(null);

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
      selectedLabFacultyIds,
      allowDifferentTeachers
    );
  }, [currentSubject, selectedTheoryFacultyIds, selectedLabFacultyIds, selectedSlots, subjectType, allowDifferentTeachers]);

  const handleSlotToggle = (slots, adding, label = slots.join("+")) => {
    setSelectedSlotGroups((current) => {
      let next;
      if (!adding) {
        next = current.filter((group) => !group.slots.some((slot) => slots.includes(slot)));
      } else {
        next = current.filter((group) => !group.slots.some((slot) => slots.includes(slot)));
        next = [...next, { label: formatSlotLabel(label), slots }];
      }

      // Recompute each subject's options from its full allOptions, filtered to new slot set
      const newSlotSet = new Set(next.flatMap((g) => g.slots));
      setSelectedSubjects((curSubjects) =>
        curSubjects.map((subject) => ({
          ...subject,
          options: (subject.allOptions || subject.options).filter((opt) =>
            opt.slots.every((s) => newSlotSet.has(s))
          )
        }))
      );

      return next;
    });
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage("Slots updated.");
  };

  const resetSlots = () => {
    setSelectedSlotGroups([]);
    setResults([]);
    setAutoSlotNotice(null);
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

  // Auto-add faculty slots to the timetable when a faculty is selected.
  // Returns { added, clashing } notice object, or null if nothing to do.
  const autoAddFacultySlots = (slots) => {
    if (!slots.length) return null;
    const currentSlotSet = new Set(selectedSlots);
    const missingSlots = slots.filter((s) => !currentSlotSet.has(s));
    if (!missingSlots.length) return null;

    const clashingSlots = missingSlots.filter((s) =>
      selectedSlots.some((existing) => isClash(s, existing))
    );
    const slotsToAdd = missingSlots.filter((s) => !clashingSlots.includes(s));

    if (slotsToAdd.length > 0) {
      setSelectedSlotGroups((current) => {
        let next = [...current];
        for (const slot of slotsToAdd) {
          next = next.filter((group) => !group.slots.includes(slot));
          next = [...next, { label: slot, slots: [slot] }];
        }
        const newSlotSet = new Set(next.flatMap((g) => g.slots));
        setSelectedSubjects((curSubjects) =>
          curSubjects.map((subject) => ({
            ...subject,
            options: (subject.allOptions || subject.options).filter((opt) =>
              opt.slots.every((s) => newSlotSet.has(s))
            )
          }))
        );
        return next;
      });
      setConflictExplanations([]);
      setBlockerSuggestions([]);
    }

    return { added: slotsToAdd, clashing: clashingSlots };
  };

  const toggleTheoryFaculty = (id) => {
    const isAdding = !selectedTheoryFacultyIds.includes(id);
    setSelectedTheoryFacultyIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

    if (isAdding) {
      const faculty = (currentSubject?.faculty || []).find((f) => f.id === id);
      if (!faculty) return;

      const theorySlots = faculty.slots || faculty.theorySlots || [];
      let extraSlots = [];

      // When "Allow different teacher" is OFF, auto-select the same faculty for lab
      if (needsLab && !allowDifferentTeachers && (faculty.labSlots || []).length > 0) {
        setSelectedLabFacultyIds((cur) =>
          cur.includes(id) ? cur : [...cur, id]
        );
        extraSlots = faculty.labSlots || [];
      }

      const notice = autoAddFacultySlots([...theorySlots, ...extraSlots]);
      if (notice && (notice.added.length > 0 || notice.clashing.length > 0)) {
        setAutoSlotNotice(notice);
      }
    } else {
      // Deselecting: also remove from lab if "Allow different teacher" is OFF
      if (needsLab && !allowDifferentTeachers) {
        setSelectedLabFacultyIds((cur) => cur.filter((x) => x !== id));
      }
    }
  };

  const toggleLabFaculty = (id) => {
    const isAdding = !selectedLabFacultyIds.includes(id);
    setSelectedLabFacultyIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

    if (isAdding) {
      const faculty = (currentSubject?.faculty || []).find((f) => f.id === id);
      if (faculty) {
        const labSlots = faculty.labSlots || [];
        const notice = autoAddFacultySlots(labSlots);
        if (notice && (notice.added.length > 0 || notice.clashing.length > 0)) {
          setAutoSlotNotice(notice);
        }
      }
    }
  };

  const setAllTheoryFaculty = (checked) => {
    const ids = checked ? theoryFaculty.map((f) => f.id) : [];
    setSelectedTheoryFacultyIds(ids);

    if (checked && needsLab && !allowDifferentTeachers) {
      // Auto-select matching lab faculty for same-teacher mode
      const labIds = theoryFaculty
        .filter((f) => (f.labSlots || []).length > 0)
        .map((f) => f.id);
      setSelectedLabFacultyIds(labIds);
    }

    if (checked) {
      // Auto-add all theory slots (and lab slots if same-teacher mode) to timetable
      const allSlots = theoryFaculty.flatMap((f) => {
        const theory = f.slots || f.theorySlots || [];
        const lab = needsLab && !allowDifferentTeachers ? (f.labSlots || []) : [];
        return [...theory, ...lab];
      });
      const uniqueSlots = [...new Set(allSlots)];
      const notice = autoAddFacultySlots(uniqueSlots);
      if (notice && (notice.added.length > 0 || notice.clashing.length > 0)) {
        setAutoSlotNotice(notice);
      }
    }
  };

  const setAllLabFaculty = (checked) => {
    const ids = checked ? labFaculty.map((f) => f.id) : [];
    setSelectedLabFacultyIds(ids);

    if (checked) {
      const allSlots = labFaculty.flatMap((f) => f.labSlots || []);
      const uniqueSlots = [...new Set(allSlots)];
      const notice = autoAddFacultySlots(uniqueSlots);
      if (notice && (notice.added.length > 0 || notice.clashing.length > 0)) {
        setAutoSlotNotice(notice);
      }
    }
  };

  const changeSchool = (code) => {
    setSchoolCode(code);
    setSubjectCode("");
    setSubjectType("theory");
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    setAutoSlotNotice(null);
  };

  const changeSubject = (code) => {
    setSubjectCode(code);
    const subject = allSubjects.find((s) => s.code === code);
    setSubjectType(subject?.type === "theory" ? "theory" : "theory_lab");
    setAllowDifferentTeachers(false);
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    setAutoSlotNotice(null);
  };

  const changeSubjectType = (type) => {
    setSubjectType(type);
    setAllowDifferentTeachers(false);
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    setAutoSlotNotice(null);
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

    const allSlotKeys = Object.keys(slotTimes);
    // allOptions = every option these faculty can make regardless of slot selection
    const allOptions = buildSubjectOptions(
      currentSubject,
      selectedTheoryFacultyIds,
      allSlotKeys,
      subjectType,
      selectedLabFacultyIds,
      allowDifferentTeachers
    );
    // options = filtered to only what fits current slot selection
    const options = allOptions.filter((opt) =>
      opt.slots.every((s) => selectedSlots.includes(s))
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
        allOptions,  // full set — refiltered on every slot change
        options      // slot-filtered — what the solver actually uses
      }
    ]);
    setSubjectCode("");
    setSubjectType("theory");
    setSelectedTheoryFacultyIds([]);
    setSelectedLabFacultyIds([]);
    
    setConflictExplanations([]);
    setBlockerSuggestions([]);
    setMessage(`${currentSubject.name} added - ${options.length} valid option(s).`);
  };

  const removeSubject = (code) => {
    setSelectedSubjects((cur) => cur.filter((s) => s.code !== code));
    
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

  const runGenerate = useCallback((subjects, warnings) => {
    if (!subjects.length) return;
    if (warnings.length) {
      setResults([]);
      setConflictExplanations([]);
      setBlockerSuggestions([]);
      setMessage(formatSlotRequirementMessage(warnings[0]));
      return;
    }
    const { results: solved, stoppedEarly } = solveTimetables(subjects);
    const blockers = solved.length ? [] : findSubjectBlockers(subjects);
    const conflicts = solved.length || blockers.length ? [] : explainTimetableConflicts(subjects);
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
  }, []);

  const generate = () => {
    if (!selectedSubjects.length) { setMessage("Add at least one course."); return; }
    setHasGenerated(true);
    runGenerate(selectedSubjects, slotRequirementWarnings);
  };

  // Auto re-run whenever slots or subjects change, but ONLY after user has generated once
  const hasGeneratedRef = useRef(false);
  useEffect(() => { hasGeneratedRef.current = hasGenerated; }, [hasGenerated]);

  useEffect(() => {
    if (!hasGeneratedRef.current) return;
    if (!selectedSubjects.length) { setResults([]); setConflictExplanations([]); setBlockerSuggestions([]); return; }
    runGenerate(selectedSubjects, slotRequirementWarnings);
  }, [selectedSlotGroups, selectedSubjects]);

  const jumpToStep = (idx) => {
    const refs = [slotsPanelRef, coursePanelRef, resultsPanelRef];
    const el = refs[idx]?.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="app-shell" id="app" ref={appRef}>
      <StepOverview
        slotsCount={selectedSlotGroups.length}
        coursesCount={selectedSubjects.length}
        hasResults={results.length > 0}
        onJump={jumpToStep}
      />

      <section className="panel timetable-panel" ref={slotsPanelRef}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Step 01</p>
            <h2>Select Slots</h2>
            <p className="step-hint">Click a time slot below to mark when you're free. Theory slots are blue, lab slots are green.</p>
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

      <section className="config-grid" ref={coursePanelRef}>
        <section className="panel course-config-panel">
        <div className="panel-header-inner">
        <p className="eyebrow">Step 02</p>
        <h2>Configure Course</h2>
        <p className="step-hint">Pick your school, subject, and faculty — then click Add Course.</p>
          </div>

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

          {needsLab && (
            <div className="field toggle-field">
              <span>Allow different teacher for theory &amp; lab</span>
              <button
                type="button"
                className={`toggle-button${allowDifferentTeachers ? " toggle-on" : " toggle-off"}`}
                onClick={() => setAllowDifferentTeachers((prev) => !prev)}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">{allowDifferentTeachers ? "On" : "Off"}</span>
              </button>
            </div>
          )}

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

          {autoSlotNotice && (
            <div className={`auto-slot-notice ${autoSlotNotice.clashing.length > 0 ? "auto-slot-notice-warn" : "auto-slot-notice-ok"}`}>
              <div className="auto-slot-notice-body">
                <span className="auto-slot-notice-icon">
                  {autoSlotNotice.clashing.length > 0 ? "⚠️" : "✓"}
                </span>
                <div className="auto-slot-notice-text">
                  {autoSlotNotice.added.length > 0 && (
                    <span>
                      <strong>{autoSlotNotice.added.join(", ")}</strong>{" "}
                      {autoSlotNotice.added.length === 1 ? "slot was" : "slots were"} automatically added to the timetable based on your faculty selection.
                    </span>
                  )}
                  {autoSlotNotice.clashing.length > 0 && (
                    <span>
                      {autoSlotNotice.added.length > 0 ? " " : ""}
                      Could not auto-add <strong>{autoSlotNotice.clashing.join(", ")}</strong> — {autoSlotNotice.clashing.length === 1 ? "it clashes" : "they clash"} with your existing slot selection. Please add {autoSlotNotice.clashing.length === 1 ? "it" : "them"} manually after resolving the conflict.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="auto-slot-notice-close"
                onClick={() => setAutoSlotNotice(null)}
                aria-label="Dismiss"
              >✕</button>
            </div>
          )}

          <p className={`hint${validFacultyPreview.length === 0 && currentSubject ? " hint-zero" : ""}`}>
            {validFacultyPreview.length === 0 && currentSubject
              ? "⚠ 0 options match your selected slots"
              : `${validFacultyPreview.length} option(s) match your selected slots.`}
            {needsLab && !allowDifferentTeachers && validFacultyPreview.length === 0 && selectedTheoryFacultyIds.length > 0 && selectedLabFacultyIds.length > 0 && (
              <span className="hint-warn"> No teacher handles both theory and lab. Try turning on <em>Allow different teacher</em>.</span>
            )}
            {needsLab && !allowDifferentTeachers && validFacultyPreview.length === 0 && selectedTheoryFacultyIds.length > 0 && selectedLabFacultyIds.length === 0 && (
              <span className="hint-warn"> The selected theory teacher has no lab slots. Try turning on <em>Allow different teacher</em> to pick separate lab faculty.</span>
            )}
          </p>

          <button className="primary-button" type="button" onClick={addSubject}>
            Add Course
          </button>
        </section>

        <section className="panel selected-courses-panel">
  <div className="panel-header">
    <div>
      <p className="eyebrow">Step 03</p>
      <h2>Selected Courses</h2>
    </div>
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
            {hasGenerated ? "⟳ Re-generate Timetables" : "Generate Timetables"}
          </button>
        </section>
      </section>

      <section className="panel results-panel" ref={resultsPanelRef}>
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
         <p className="results-empty-bold">Generated timetables will appear here after you click <strong>Generate</strong>.</p>
        )}
      </section>
      <Analytics />
    </main>
  );
}

export default App;
