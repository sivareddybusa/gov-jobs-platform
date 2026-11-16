import { describe, expect, it } from "vitest";
import {
  appearsVerbatim,
  checkGeneratedDraft,
  checkOfficialDraft,
  hasAnswerKey,
  isTimeSensitiveTopic,
  leafTopics,
  pickTopicsToGenerate,
  questionContentKey,
  shuffleOptions,
  solveAgrees,
  topicKey,
  type QuestionDraft,
} from "@/domain/questions";

const good: QuestionDraft = {
  prompt: "What is the value of 15% of 200?",
  options: ["20", "25", "30", "35"],
  correctIndex: 2,
  explanation: "15% of 200 is 0.15 x 200 = 30.",
};

describe("checkGeneratedDraft", () => {
  it("accepts a well-formed question", () => {
    expect(checkGeneratedDraft(good)).toEqual([]);
  });
  it("rejects duplicate options, compound options and out-of-range answers", () => {
    expect(checkGeneratedDraft({ ...good, options: ["20", "20", "30", "35"] })).toContain(
      "duplicate_options",
    );
    expect(
      checkGeneratedDraft({ ...good, options: ["20", "25", "30", "All of the above"] }),
    ).toContain("compound_option");
    expect(checkGeneratedDraft({ ...good, correctIndex: 4 })).toContain("answer_out_of_range");
    expect(checkGeneratedDraft({ ...good, options: ["a", "b", "c"] })).toContain("option_count");
  });
  it("rejects questions that depend on material we do not have", () => {
    expect(
      checkGeneratedDraft({ ...good, prompt: "Based on the following graph, what is the trend?" }),
    ).toContain("needs_external_material");
    expect(
      checkGeneratedDraft({ ...good, prompt: "Read the passage and answer the question." }),
    ).toContain("needs_external_material");
  });
  it("rejects vague questions about the topic itself", () => {
    for (const prompt of [
      "What is the purpose of identifying similarities and differences between concepts?",
      "What is a key difference between a painting and a sculpture?",
      "Which of the following is a difference between a novel and a poem?",
    ]) {
      expect(checkGeneratedDraft({ ...good, prompt })).toContain("vague_prompt");
    }
    expect(checkGeneratedDraft(good)).not.toContain("vague_prompt");
  });
  it("requires an explanation and a sane prompt length", () => {
    expect(checkGeneratedDraft({ ...good, explanation: "" })).toContain("missing_explanation");
    expect(checkGeneratedDraft({ ...good, prompt: "Short?" })).toContain("prompt_length");
  });
});

describe("checkOfficialDraft", () => {
  it("allows compound options and needs no explanation (official papers use them)", () => {
    const d = { ...good, options: ["20", "25", "30", "All of the above"], explanation: "" };
    expect(checkOfficialDraft(d)).toEqual([]);
    expect(checkOfficialDraft({ ...d, options: ["20", "20", "30", "35"] })).toContain(
      "duplicate_options",
    );
  });
});

describe("solveAgrees", () => {
  it("needs the same option; undecided never agrees", () => {
    expect(solveAgrees(2, 2)).toBe(true);
    expect(solveAgrees(2, 1)).toBe(false);
    expect(solveAgrees(0, null)).toBe(false);
    expect(solveAgrees(0, undefined)).toBe(false);
  });
});

describe("shuffleOptions", () => {
  it("keeps the correct answer attached to its option", () => {
    for (const seed of [0.01, 0.3, 0.5, 0.77, 0.99]) {
      const s = shuffleOptions(good, () => seed);
      expect([...s.options].sort()).toEqual([...good.options].sort());
      expect(s.options[s.correctIndex]).toBe("30");
    }
  });
});

describe("questionContentKey", () => {
  it("ignores option order, case and punctuation", () => {
    expect(questionContentKey("What is 2+2?", ["4", "5", "6", "7"])).toBe(
      questionContentKey("what is 2 2", ["7", "6", "5", "4"]),
    );
  });
});

describe("topics", () => {
  const tree = [
    {
      name: "Quantitative Aptitude",
      children: [
        {
          name: "Algebra",
          children: [{ name: "Linear equations" }, { name: "Quadratic equations" }],
        },
      ],
    },
    { name: "Reasoning Ability" },
    { name: "Current Affairs", children: [{ name: "Awards" }] },
  ];
  it("uses branch leaves with their subject, and drops time-sensitive topics", () => {
    expect(leafTopics(tree)).toEqual([
      { subject: "Quantitative Aptitude", topic: "Linear equations" },
      { subject: "Quantitative Aptitude", topic: "Quadratic equations" },
      { subject: "Reasoning Ability", topic: "Reasoning Ability" },
    ]);
    expect(isTimeSensitiveTopic("Budget 2026")).toBe(true);
    expect(isTimeSensitiveTopic("Algebra")).toBe(false);
  });
  it("picks the thinnest topics and skips those at target", () => {
    const topics = leafTopics(tree);
    const counts = new Map([
      [topicKey("Linear equations"), 5],
      [topicKey("Quadratic equations"), 2],
    ]);
    expect(pickTopicsToGenerate(topics, counts, 5).map((t) => t.topic)).toEqual([
      "Reasoning Ability",
      "Quadratic equations",
    ]);
    expect(pickTopicsToGenerate(topics, counts, 1)).toHaveLength(1);
  });
});

describe("official papers", () => {
  const source =
    "1. What is the capital of India?\n(a) Mumbai (b) Delhi (c) Kolkata (d) Chennai\nAnswer Key: 1-b";
  it("requires a stated answer key", () => {
    expect(hasAnswerKey(source)).toBe(true);
    expect(hasAnswerKey("1. What is 2+2? (a) 3 (b) 4 (c) 5 (d) 6")).toBe(false);
  });
  it("accepts only questions that literally appear in the source", () => {
    expect(
      appearsVerbatim(
        {
          prompt: "What is the capital of India?",
          options: ["Mumbai", "Delhi", "Kolkata", "Chennai"],
        },
        source,
      ),
    ).toBe(true);
    expect(
      appearsVerbatim(
        {
          prompt: "What is the capital of India?",
          options: ["Mumbai", "Delhi", "Kolkata", "Pune"],
        },
        source,
      ),
    ).toBe(false);
    expect(
      appearsVerbatim(
        {
          prompt: "Which river is the longest?",
          options: ["Mumbai", "Delhi", "Kolkata", "Chennai"],
        },
        source,
      ),
    ).toBe(false);
  });
});
