import { PERMISSIONS as P, ROLES, type PermissionCode, type RoleId } from './codes';

// The role/permission matrix of backlog section 5 (least privilege), as data. The seed writes
// it to the database; Task 3.1 finalizes, documents and tests it. "Change own regular
// password" has no permission code: every fully authenticated user may do it.

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    id: ROLES.ADMINISTRATOR,
    name: 'Administrator',
    description: 'Manages user accounts and global security settings; reads no ticket content.',
  },
  {
    id: ROLES.MANAGER,
    name: 'Manager',
    description: 'Kierownik: sees and assigns all tickets and updates the status of any ticket.',
  },
  {
    id: ROLES.EMPLOYEE,
    name: 'Employee',
    description: 'Pracownik: works on tickets assigned to them and sees tickets they created.',
  },
  {
    id: ROLES.GUEST,
    name: 'Guest',
    description: 'Gość: creates tickets and sees only the tickets they created.',
  },
];

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  [P.USERS_READ]: 'List and read user accounts',
  [P.USERS_CREATE]: 'Create user accounts',
  [P.USERS_UPDATE]: 'Edit user accounts',
  [P.USERS_BLOCK]: 'Block and unblock user accounts',
  [P.USERS_DELETE]: 'Delete user accounts',
  [P.USERS_RESET_PASSWORD]: "Reset another user's password",
  [P.USERS_RESET_TOTP]:
    "Reset another user's two-factor authentication after identity verification",
  [P.SECURITY_SETTINGS_READ]: 'Read global security settings',
  [P.SECURITY_SETTINGS_UPDATE]: 'Change global security settings',
  [P.SECURITY_EVENTS_READ]: 'List and read security events',
  [P.SECURITY_EVENTS_ACKNOWLEDGE]: 'Acknowledge a security event',
  [P.USERS_UNLOCK]: 'Clear the temporary lock of a user account',
  [P.IP_BLOCKS_READ]: 'List the currently blocked client addresses',
  [P.IP_BLOCKS_CLEAR]: 'Clear the block of a client address',
  [P.HONEYTOKENS_READ]: 'See the status of the honeytokens',
  [P.HONEYTOKENS_TEST]: 'Fire a clearly marked test alert for a honeytoken',
  [P.TICKETS_CREATE]: 'Create a ticket',
  [P.TICKETS_READ_ALL]: 'Read all tickets',
  [P.TICKETS_READ_ASSIGNED]: 'Read tickets assigned to oneself',
  [P.TICKETS_READ_OWN]: 'Read tickets created by oneself',
  [P.TICKETS_ASSIGN]: 'Assign a ticket to an employee',
  [P.TICKETS_STATUS_UPDATE_ALL]: 'Update the status of any ticket',
  [P.TICKETS_STATUS_UPDATE_ASSIGNED]: 'Update the status of a ticket assigned to oneself',
};

export const ROLE_PERMISSIONS: Record<RoleId, readonly PermissionCode[]> = {
  [ROLES.ADMINISTRATOR]: [
    P.USERS_READ,
    P.USERS_CREATE,
    P.USERS_UPDATE,
    P.USERS_BLOCK,
    P.USERS_DELETE,
    P.USERS_RESET_PASSWORD,
    P.USERS_RESET_TOTP,
    P.SECURITY_SETTINGS_READ,
    P.SECURITY_SETTINGS_UPDATE,
    P.SECURITY_EVENTS_READ,
    P.SECURITY_EVENTS_ACKNOWLEDGE,
    P.USERS_UNLOCK,
    P.IP_BLOCKS_READ,
    P.IP_BLOCKS_CLEAR,
    P.HONEYTOKENS_READ,
    P.HONEYTOKENS_TEST,
  ],
  [ROLES.MANAGER]: [
    P.TICKETS_CREATE,
    P.TICKETS_READ_ALL,
    P.TICKETS_READ_ASSIGNED,
    P.TICKETS_READ_OWN,
    P.TICKETS_ASSIGN,
    P.TICKETS_STATUS_UPDATE_ALL,
    P.TICKETS_STATUS_UPDATE_ASSIGNED,
  ],
  [ROLES.EMPLOYEE]: [
    P.TICKETS_CREATE,
    P.TICKETS_READ_ASSIGNED,
    P.TICKETS_READ_OWN,
    P.TICKETS_STATUS_UPDATE_ASSIGNED,
  ],
  [ROLES.GUEST]: [P.TICKETS_CREATE, P.TICKETS_READ_OWN],
};
