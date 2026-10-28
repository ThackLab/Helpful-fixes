// Courses outside the graded levels: open from the start, in any order.

export interface Course {
  id: string;
  name: string;
  /** What the course teaches, in one line. */
  goal: string;
  /** Lesson ids, in order. */
  lessons: string[];
}

export const COURSES: Course[] = [
  {
    id: 'strategy',
    name: 'Strategy',
    goal: 'What to do when there is nothing to calculate',
    lessons: ['worst-piece', 'outposts', 'weak-pawns', 'open-files', 'bishops', 'pawn-breaks', 'trades'],
  },
  {
    id: 'endgames',
    name: 'Endgames',
    goal: 'The endings every player needs to know',
    lessons: ['queen-mate', 'rook-mate', 'opposition', 'pawn-square', 'promotion', 'outside-passer', 'rook-behind', 'lucena', 'philidor'],
  },
];

export const courseOfLesson = (lessonId: string) => COURSES.find((c) => c.lessons.includes(lessonId));
