export const destinations = {
  index: {
    title: 'Today',
    icon: 'home',
    description: 'Your day, at a glance.',
    future: 'Your daily priorities and household updates will appear here in a future milestone.',
  },
  routines: {
    title: 'Routines',
    icon: 'repeat',
    description: 'Keep everyday life running smoothly.',
    future: 'Daily routines, care schedules, and household checklists are planned.',
  },
  wellness: {
    title: 'Wellness',
    icon: 'heart',
    description: 'Make space for feeling your best.',
    future: 'Personal goals, healthy habits, and medication and vitamin tracking are planned.',
  },
  responsibilities: {
    title: 'Responsibilities',
    icon: 'clipboard',
    description: 'Keep household and property responsibilities organized.',
    future: 'Household responsibilities, property maintenance, and delegated follow-ups are planned.',
  },
  inbox: {
    title: 'Inbox',
    icon: 'inbox',
    description: 'Capture now. Organize later.',
    future: 'Quick task capture, ideas and reminders, and items awaiting organization are planned.',
  },
} as const;
