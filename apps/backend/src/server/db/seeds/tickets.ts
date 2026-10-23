import { normalizeLogin } from '../../users/login';
import type { AppTransaction } from '../connection';
import { type TicketStatus, tickets, users } from '../schema';

// Demo tickets for development and test databases only: `seedDatabase` adds them when asked, and
// the CLI asks unless NODE_ENV is `production`. They exist to show, and to test, who sees what:
// each one relates to the seed accounts in a different way. Texts are plain text, in Polish like
// the rest of the application.

interface DemoTicket {
  /** A fixed, valid UUID, so tests and reviewers can address the ticket and a re-run finds it. */
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  /** Logins of seed accounts. */
  createdBy: string;
  assignedTo: string | null;
}

export const DEMO_TICKETS = {
  /** A guest's ticket nobody has picked up. Seen by guest1 and every Manager. */
  guest1Unassigned: {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Brak dostępu do sieci Wi-Fi dla gości',
    description: 'Po wpisaniu hasła sieć gości nie przydziela adresu. Proszę o sprawdzenie.',
    status: 'OPEN',
    createdBy: 'guest1',
    assignedTo: null,
  },
  /** A guest's ticket assigned to an employee: seen by that guest, that employee and Managers. */
  guest2ToEmployee1: {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Przepustka do sali konferencyjnej nie działa',
    description: 'Czytnik przy drzwiach sali B odrzuca moją przepustkę gościa.',
    status: 'IN_PROGRESS',
    createdBy: 'guest2',
    assignedTo: 'employee1',
  },
  /** An employee's own ticket, not assigned: seen by its creator and Managers only. */
  employee1Own: {
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Wymiana monitora na stanowisku 14',
    description: 'Monitor przygasa po kilku minutach pracy. Potrzebny jest zamiennik.',
    status: 'OPEN',
    createdBy: 'employee1',
    assignedTo: null,
  },
  /** Created by and assigned to the same employee: must appear once, not twice, in a list. */
  employee2ToSelf: {
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Aktualizacja oprogramowania na laptopie służbowym',
    description: 'Instalator wymaga uprawnień, których nie mam. Biorę to zgłoszenie na siebie.',
    status: 'OPEN',
    createdBy: 'employee2',
    assignedTo: 'employee2',
  },
  /** A Manager's ticket handed to an employee: seen by that employee as assigned work. */
  manager1ToEmployee1: {
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Przegląd uprawnień dostępu do archiwum',
    description: 'Proszę zweryfikować, kto ma dostęp do archiwum dokumentów, i zgłosić różnice.',
    status: 'RESOLVED',
    createdBy: 'manager1',
    assignedTo: 'employee1',
  },
} as const satisfies Record<string, DemoTicket>;

/**
 * Inserts the demo tickets that are not there yet and returns how many it created. A ticket that
 * exists (matched by its fixed id) is left exactly as it is, so re-running never resets a status
 * or an assignee that someone changed. It must run after the accounts exist, in the same
 * transaction; an account it cannot find is an error, not something to skip silently.
 */
export function seedTickets(tx: AppTransaction): number {
  const idByLogin = new Map(
    tx
      .select({ id: users.id, loginNormalized: users.loginNormalized })
      .from(users)
      .all()
      .map((row) => [row.loginNormalized, row.id]),
  );
  const accountId = (login: string): string => {
    const id = idByLogin.get(normalizeLogin(login));
    if (!id) throw new Error(`demo ticket refers to the unknown account "${login}"`);
    return id;
  };

  let created = 0;
  for (const ticket of Object.values<DemoTicket>(DEMO_TICKETS)) {
    const inserted = tx
      .insert(tickets)
      .values({
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        createdByUserId: accountId(ticket.createdBy),
        assignedToUserId: ticket.assignedTo ? accountId(ticket.assignedTo) : null,
      })
      .onConflictDoNothing()
      .returning({ id: tickets.id })
      .all();
    created += inserted.length;
  }
  return created;
}
