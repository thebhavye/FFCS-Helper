import { hasAnyClash, isClash } from "./slots.js";

const MAX_RESULTS = 50;
const MAX_SEARCH_STEPS = 120000;
const MAX_BLOCKER_SEARCH_STEPS = 600000;
const MAX_CONFLICT_EXPLANATIONS = 8;
const MAX_BLOCKER_SUGGESTIONS = 1;

const allSlotsAllowed = (slots, selectedSet) =>
  slots.every((slot) => selectedSet.has(slot));

const hasInternalClash = (slots) =>
  slots.some((slot, index) =>
    slots.slice(index + 1).some((other) => isClash(slot, other))
  );

const facultyTheorySlots = (faculty) => faculty.slots || faculty.theorySlots || [];
const facultyLabSlots = (faculty) => faculty.labSlots || [];

const makeTheoryOption = (subject, faculty) => {
  const slots = facultyTheorySlots(faculty);

  return {
    subjectCode: subject.code,
    subjectName: subject.name,
    type: "theory",
    facultyName: faculty.name,
    room: faculty.room || faculty.theoryRoom || "",
    theoryRoom: faculty.theoryRoom || faculty.room || "",
    labRoom: "",
    theorySlots: slots,
    labSlots: [],
    slots
  };
};

const makeCombinedOption = (subject, theoryFaculty, labFaculty) => {
  const theorySlots = facultyTheorySlots(theoryFaculty);
  const labSlots = facultyLabSlots(labFaculty);
  const slots = [...theorySlots, ...labSlots];

  return {
    subjectCode: subject.code,
    subjectName: subject.name,
    type: "theory_lab",
    facultyName:
      theoryFaculty.id === labFaculty.id
        ? theoryFaculty.name
        : `${theoryFaculty.name} / ${labFaculty.name}`,
    theoryFacultyName: theoryFaculty.name,
    labFacultyName: labFaculty.name,
    room: "",
    theoryRoom: theoryFaculty.theoryRoom || theoryFaculty.room || "",
    labRoom: labFaculty.labRoom || labFaculty.room || "",
    theorySlots,
    labSlots,
    slots
  };
};

const optionIsUsable = (option, selectedSet) =>
  allSlotsAllowed(option.slots, selectedSet) && !hasInternalClash(option.slots);

const makeOption = (subject, faculty) => {
  const slots = faculty.slots || [
    ...(faculty.theorySlots || []),
    ...(faculty.labSlots || [])
  ];

  return {
    subjectCode: subject.code,
    subjectName: subject.name,
    type: subject.type,
    facultyName: faculty.name,
    room: faculty.room || "",
    theoryRoom: faculty.theoryRoom || "",
    labRoom: faculty.labRoom || "",
    theorySlots: faculty.theorySlots || slots,
    labSlots: faculty.labSlots || [],
    slots
  };
};

export function buildSubjectOptions(
  subject,
  selectedFacultyIds,
  selectedSlots,
  selectedType = subject.type,
  selectedLabFacultyIds = []
) {
  const selectedSet = new Set(selectedSlots);
  const chosenTheoryIds = new Set(selectedFacultyIds);
  const chosenLabIds = new Set(selectedLabFacultyIds);

  if (selectedType === "theory") {
    return subject.faculty
      .filter((faculty) => chosenTheoryIds.has(faculty.id))
      .map((faculty) => makeTheoryOption(subject, faculty))
      .filter((option) => optionIsUsable(option, selectedSet));
  }

  if (selectedType === "theory_lab" || selectedType === "integrated") {
    const theoryFaculty = subject.faculty.filter((faculty) =>
      chosenTheoryIds.has(faculty.id) &&
      facultyTheorySlots(faculty).length > 0 &&
      allSlotsAllowed(facultyTheorySlots(faculty), selectedSet)
    );
    const labFaculty = subject.faculty.filter((faculty) =>
      chosenLabIds.has(faculty.id) &&
      facultyLabSlots(faculty).length > 0 &&
      allSlotsAllowed(facultyLabSlots(faculty), selectedSet)
    );
    const options = [];

    theoryFaculty.forEach((theoryFac) => {
      labFaculty.forEach((labFac) => {
        const option = makeCombinedOption(subject, theoryFac, labFac);
        if (!hasInternalClash(option.slots)) {
          options.push(option);
        }
      });
    });

    return options;
  }

  return subject.faculty
    .filter((faculty) => chosenTheoryIds.has(faculty.id))
    .map((faculty) => makeOption(subject, faculty))
    .filter((option) => optionIsUsable(option, selectedSet));
}

export function solveTimetables(selectedSubjects, maxSearchSteps = MAX_SEARCH_STEPS) {
  const results = [];
  let searchSteps = 0;
  let stoppedEarly = false;
  const subjects = [...selectedSubjects].sort((a, b) => a.options.length - b.options.length);

  if (subjects.some((subject) => !subject.options.length)) {
    return { results, stoppedEarly, searchSteps };
  }

  const visit = (subjectIndex, schedule, occupiedSlots) => {
    if (results.length >= MAX_RESULTS) return;
    if (searchSteps >= maxSearchSteps) {
      stoppedEarly = true;
      return;
    }

    if (subjectIndex === subjects.length) {
      results.push(schedule);
      return;
    }

    const subject = subjects[subjectIndex];
    for (const option of subject.options) {
      searchSteps += 1;
      if (searchSteps >= maxSearchSteps) {
        stoppedEarly = true;
        return;
      }
      if (hasAnyClash(option.slots, occupiedSlots)) continue;

      visit(
        subjectIndex + 1,
        [...schedule, option],
        [...occupiedSlots, ...option.slots]
      );
    }
  };

  visit(0, [], []);
  return { results, stoppedEarly, searchSteps };
}

const findOptionClash = (optionA, optionB) => {
  for (const slotA of optionA.slots) {
    for (const slotB of optionB.slots) {
      if (isClash(slotA, slotB)) {
        return { slotA, slotB };
      }
    }
  }
  return null;
};

const formatOptionName = (option) => {
  const faculty = option.facultyName ? ` / ${option.facultyName}` : "";
  return `${option.subjectName}${faculty}`;
};

const subjectsHaveAnyClash = (subjectA, subjectB) =>
  subjectA.options.some((optionA) =>
    subjectB.options.some((optionB) => findOptionClash(optionA, optionB))
  );

const findSubjectClashDetails = (subject, otherSubjects, maxDetails = 4) => {
  const details = [];

  for (const otherSubject of otherSubjects) {
    let foundForSubject = false;

    for (const optionA of subject.options) {
      if (foundForSubject) break;

      for (const optionB of otherSubject.options) {
        const clash = findOptionClash(optionA, optionB);
        if (!clash) continue;

        details.push({
          subject: otherSubject.name,
          optionA: formatOptionName(optionA),
          optionB: formatOptionName(optionB),
          slotA: clash.slotA,
          slotB: clash.slotB
        });
        foundForSubject = true;
        break;
      }
    }

    if (details.length >= maxDetails) {
      return details;
    }
  }

  return details;
};

export function explainTimetableConflicts(
  selectedSubjects,
  maxExplanations = MAX_CONFLICT_EXPLANATIONS
) {
  const explanations = [];

  for (let i = 0; i < selectedSubjects.length; i += 1) {
    for (let j = i + 1; j < selectedSubjects.length; j += 1) {
      const subjectA = selectedSubjects[i];
      const subjectB = selectedSubjects[j];
      let foundForPair = false;

      for (const optionA of subjectA.options) {
        if (foundForPair) break;

        for (const optionB of subjectB.options) {
          const clash = findOptionClash(optionA, optionB);
          if (!clash) continue;

          explanations.push({
            subjectA: subjectA.name,
            subjectB: subjectB.name,
            optionA: formatOptionName(optionA),
            optionB: formatOptionName(optionB),
            slotA: clash.slotA,
            slotB: clash.slotB
          });
          foundForPair = true;
          break;
        }
      }

      if (explanations.length >= maxExplanations) {
        return explanations;
      }
    }
  }

  return explanations;
}

export function findSubjectBlockers(
  selectedSubjects,
  maxSuggestions = MAX_BLOCKER_SUGGESTIONS
) {
  const suggestions = [];

  if (selectedSubjects.length < 2) {
    return suggestions;
  }

  for (let index = 0; index < selectedSubjects.length; index += 1) {
    const subject = selectedSubjects[index];
    const remainingSubjects = selectedSubjects.filter((_, curIndex) => curIndex !== index);
    const { results, stoppedEarly } = solveTimetables(remainingSubjects, MAX_BLOCKER_SEARCH_STEPS);
    const clashCount = remainingSubjects.filter((otherSubject) =>
      subjectsHaveAnyClash(subject, otherSubject)
    ).length;
    const clashesWithEveryOtherSubject = clashCount === remainingSubjects.length;
    const clashDetails = findSubjectClashDetails(subject, remainingSubjects);

    if (results.length) {
      suggestions.push({
        subject: subject.name,
        priority: subject.priority || "important",
        noValidOptions: subject.options.length === 0,
        remainingResults: results.length,
        clashCount,
        totalOtherSubjects: remainingSubjects.length,
        clashesWithEveryOtherSubject,
        clashDetails
      });
    } else if (stoppedEarly) {
      suggestions.push({
        subject: subject.name,
        priority: subject.priority || "important",
        noValidOptions: subject.options.length === 0,
        remainingResults: 0,
        uncertain: true,
        clashCount,
        totalOtherSubjects: remainingSubjects.length,
        clashesWithEveryOtherSubject,
        clashDetails
      });
    }
  }

  const confirmedSuggestions = suggestions.filter((suggestion) => !suggestion.uncertain);
  const bestPool = confirmedSuggestions.length ? confirmedSuggestions : suggestions;
  const flexiblePool = bestPool.filter((suggestion) => suggestion.priority === "flexible");
  const candidatePool = flexiblePool.length ? flexiblePool : bestPool;
  const priorityRank = (suggestion) => suggestion.priority === "flexible" ? 0 : 1;
  const ranked = candidatePool.sort((a, b) =>
    priorityRank(a) - priorityRank(b) ||
    Number(b.clashesWithEveryOtherSubject) - Number(a.clashesWithEveryOtherSubject) ||
    b.clashCount - a.clashCount ||
    b.remainingResults - a.remainingResults
  );

  return ranked.slice(0, maxSuggestions);
}
