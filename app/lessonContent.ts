// MVP 1: a single hardcoded lesson, no AI and no JSON yet.
// (Course Pack JSON + Zod validation arrives in MVP 2.)

export type LessonChunk = {
  chunkId: string;
  explanation: string;
  example?: string;
  checkQuestion: string;
  /** Accepted answers; compared after normalization (lowercase, letters/digits only). */
  accepted: string[];
  correctFeedback: string;
  /** Shown on a wrong answer so the student can retry. */
  hint: string;
};

export type Lesson = {
  lessonId: string;
  program: string;
  module: string;
  title: string;
  type: "standard";
  chunks: LessonChunk[];
};

export const writingYourFirstProgram: Lesson = {
  lessonId: "writing_your_first_program",
  program: "PY101",
  module: "Week 1 — Writing your first program",
  title: "Writing your first program",
  type: "standard",
  chunks: [
    {
      chunkId: "print_intro",
      explanation:
        "A Python program runs from top to bottom, one line at a time. To show something on the screen, you use print(). Whatever you want to display goes inside the parentheses.",
      example: 'print("Hello, world!")   →   Hello, world!',
      checkQuestion: "Which built-in function displays text on the screen in Python?",
      accepted: ["print"],
      correctFeedback: "Exactly — print() is how you show output.",
      hint: "It's a 5-letter word, and you call it with parentheses: ____().",
    },
    {
      chunkId: "print_string",
      explanation:
        "The text you want to print goes inside quotes. Text in quotes is called a string. The quotes tell Python where the text starts and ends.",
      example: 'print("Python")   →   Python',
      checkQuestion: 'What does print("Hello") display on the screen?',
      accepted: ["hello"],
      correctFeedback: "Right — the text inside the quotes.",
      hint: "Python prints what's between the quotes — and only that.",
    },
    {
      chunkId: "quotes_not_shown",
      explanation:
        "Notice the quotation marks never appear in the output — they are just markers that tell Python where the string begins and ends.",
      example: 'print("Python")   →   Python   (no quotes in the result)',
      checkQuestion: "Do the quotation marks themselves appear in the printed output? (yes / no)",
      accepted: ["no", "nope"],
      correctFeedback: "Correct — the quotes are markers, not content.",
      hint: "Look at the example: print(\"Python\") shows Python, with no quotes around it.",
    },
    {
      chunkId: "first_program",
      explanation:
        "Now put it together and write your first line of code: the function name, parentheses, and your text in quotes inside them.",
      checkQuestion: "Write a line of code that prints the word:  Python",
      accepted: ['print("Python")', "print Python"],
      correctFeedback: "🎉 That's a working Python program!",
      hint: 'Use print(), and put Python in quotes inside the parentheses: print("...").',
    },
  ],
};
