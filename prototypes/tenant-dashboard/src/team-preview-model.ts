import { teamWorkspaceSchema } from '../../../shared/team-workspace';
export class TeamPreviewStore {
  private members: any[];
  private invitations: any[] = [];
  private next = 1;
  constructor(
    private actorId: number,
    private merchantId: number,
    private mode: () => string
  ) {
    this.members = [
      {
        id: 1,
        userId: actorId,
        role: mode() === 'readonly' ? 'manager' : 'owner',
        userName: 'أنت · You',
        userEmail: 'owner@example.test',
        isActive: 1,
        accountActive: true,
        legacy: false,
        acceptedAt: '2026-10-04T12:00:00.000Z',
      },
      {
        id: 2,
        userId: actorId + 20,
        role: 'viewer',
        userName: 'عضو تجريبي · Sample member',
        userEmail: 'member@example.test',
        isActive: 1,
        accountActive: true,
        legacy: false,
        acceptedAt: '2026-10-04T12:00:00.000Z',
      },
    ];
  }
  read() {
    return teamWorkspaceSchema.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      actorRole: this.mode() === 'readonly' ? 'manager' : 'owner',
      canManageOwners: this.mode() !== 'readonly',
      members: this.members,
      hasMoreMembers: false,
      invitations: this.invitations,
      hasMoreInvitations: false,
      counts: {
        members: this.members.length,
        owners: this.members.filter(m => m.role === 'owner').length,
        pending: this.invitations.length,
        expired: 0,
      },
    });
  }
  mutate(name: string, i: any) {
    if (i.reviewed !== true) throw Error('Review required');
    if (this.mode() === 'uncertain-save') throw Error('Outcome unavailable');
    const base = {
      success: true,
      actorId: this.actorId,
      merchantId: this.merchantId,
    };
    if (name === 'team.invite') {
      if (this.invitations.some(x => x.email === i.email))
        throw { data: { code: 'CONFLICT' } };
      this.invitations.push({
        id: this.next++,
        email: i.email,
        role: i.role,
        status: 'pending',
        createdAt: '2026-10-04T12:00:00.000Z',
        expiresAt: '2026-10-11T12:00:00.000Z',
      });
      return {
        ...base,
        delivered: true,
        email: i.email,
        role: i.role,
        expiresAt: '2026-10-11T12:00:00.000Z',
      };
    }
    if (name === 'team.revokeInvite') {
      this.invitations = this.invitations.filter(x => x.id !== i.invitationId);
      return { ...base, invitationId: i.invitationId };
    }
    const member = this.members.find(m => m.id === i.memberId);
    if (!member || member.role !== i.expectedRole)
      throw { data: { code: 'CONFLICT' } };
    if (name === 'team.updateRole') member.role = i.role;
    else this.members = this.members.filter(m => m.id !== i.memberId);
    return { ...base, memberId: i.memberId };
  }
}
