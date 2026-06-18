import { Box, Text } from "ink";
import { client, getData } from "../api/client";
import type {
  ConnectionSort,
  ContentSort,
  ContentTypeFilter,
  GroupInvite,
  GroupMember,
  GroupMemberInviteResponse,
  MembershipInvitation,
} from "../api/types";
import { BlockItem } from "../components/BlockItem";
import { Spinner } from "../components/Spinner";
import { useCommand } from "../hooks/use-command";
import { plural, timeAgo } from "../lib/format";

interface GroupViewProps {
  slug: string;
}

export function GroupViewCommand({ slug }: GroupViewProps) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}", {
        params: { path: { id: slug } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text bold>{data.name}</Text>
      <Text dimColor>@{data.slug}</Text>
      {data.description?.plain && <Text>{data.description.plain}</Text>}
      <Text dimColor>
        {plural(data.counts.channels, "channel")} ·{" "}
        {plural(data.counts.users, "member")}
      </Text>
      <Text dimColor>Created {timeAgo(data.created_at)}</Text>
    </Box>
  );
}

interface GroupContentsProps {
  slug: string;
  page?: number;
  per?: number;
  type?: string;
  sort?: ContentSort;
}

export function GroupContentsCommand({
  slug,
  page = 1,
  per,
  type,
  sort,
}: GroupContentsProps) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}/contents", {
        params: {
          path: { id: slug },
          query: {
            page,
            per,
            type: type as ContentTypeFilter | undefined,
            sort,
          },
        },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading contents" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No contents</Text>
      ) : (
        data.data.map((item) => <BlockItem key={item.id} item={item} />)
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "item")}
      </Text>
    </Box>
  );
}

interface GroupFollowersProps {
  slug: string;
  page?: number;
  per?: number;
  sort?: ConnectionSort;
}

export function GroupFollowersCommand({
  slug,
  page = 1,
  per,
  sort,
}: GroupFollowersProps) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}/followers", {
        params: { path: { id: slug }, query: { page, per, sort } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading followers" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No followers</Text>
      ) : (
        data.data.map((user) => (
          <Text key={user.id}>
            {user.name} <Text dimColor>@{user.slug}</Text>
          </Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "follower")}
      </Text>
    </Box>
  );
}

function formatGroupMember(member: GroupMember): string {
  return `${member.name} (@${member.slug}) · ${member.role}`;
}

function formatInvitation(invitation: MembershipInvitation): string {
  const invitee =
    invitation.invitee?.name ??
    invitation.invitee?.slug ??
    invitation.invitee_email ??
    "Unknown invitee";
  return `${invitation.id} · ${invitee} · ${invitation.state} · invited by ${invitation.invited_by.name}`;
}

function GroupInviteLinkView({ invite }: { invite: GroupInvite }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{invite.code}</Text>
      </Text>
      <Text dimColor>{invite.url}</Text>
      <Text dimColor>Created {timeAgo(invite.created_at)}</Text>
    </Box>
  );
}

function GroupInviteOutcomeView({
  response,
}: {
  response: GroupMemberInviteResponse;
}) {
  const user = response.user
    ? `${response.user.name} (@${response.user.slug})`
    : "email invitee";
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="green">✓ </Text>
        <Text>{response.outcome.replace(/_/g, " ")}: </Text>
        <Text bold>{user}</Text>
      </Text>
      {response.invitation && (
        <Text dimColor>
          Invitation {response.invitation.id} · {response.invitation.state}
        </Text>
      )}
    </Box>
  );
}

export function GroupCreateCommand({
  name,
  description,
  avatarUrl,
}: {
  name: string;
  description?: string;
  avatarUrl?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/groups", {
        body: { name, description, avatar_url: avatarUrl },
      }),
    ),
  );

  if (loading) return <Spinner label="Creating group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Created </Text>
      <Text bold>{data.name}</Text>
      <Text dimColor> · {data.slug}</Text>
    </Box>
  );
}

export function GroupUpdateCommand({
  slug,
  name,
  description,
  avatarUrl,
}: {
  slug: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.PUT("/v3/groups/{id}", {
        params: { path: { id: slug } },
        body: { name, description, avatar_url: avatarUrl },
      }),
    ),
  );

  if (loading) return <Spinner label="Updating group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Updated </Text>
      <Text bold>{data.name}</Text>
      <Text dimColor> · {data.slug}</Text>
    </Box>
  );
}

export function GroupDeleteCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/groups/{id}", {
      params: { path: { id: slug } },
    });
    return { slug };
  });

  if (loading) return <Spinner label="Deleting group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted group {data.slug}</Text>
    </Box>
  );
}

export function GroupMembersCommand({
  slug,
  page = 1,
  per,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}/members", {
        params: { path: { id: slug }, query: { page, per } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading members" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No members</Text>
      ) : (
        data.data.map((member) => (
          <Text key={member.id}>{formatGroupMember(member)}</Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "member")}
      </Text>
    </Box>
  );
}

export function GroupJoinCommand({
  slug,
  inviteToken,
}: {
  slug: string;
  inviteToken?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/groups/{id}/members", {
        params: { path: { id: slug } },
        body: { invite_token: inviteToken },
      }),
    ),
  );

  if (loading) return <Spinner label="Joining group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Joined as {formatGroupMember(data)}</Text>
    </Box>
  );
}

export function GroupLeaveCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/groups/{id}/members/me", {
      params: { path: { id: slug } },
    });
    return { slug };
  });

  if (loading) return <Spinner label="Leaving group" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Left group {data.slug}</Text>
    </Box>
  );
}

export function GroupRemoveMemberCommand({
  slug,
  userId,
}: {
  slug: string;
  userId: number;
}) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/groups/{id}/members/{user_id}", {
      params: { path: { id: slug, user_id: userId } },
    });
    return { slug, userId };
  });

  if (loading) return <Spinner label="Removing member" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>
        Removed user {data.userId} from group {data.slug}
      </Text>
    </Box>
  );
}

export function GroupInvitationsCommand({
  slug,
  page = 1,
  per,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}/invitations", {
        params: { path: { id: slug }, query: { page, per } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading invitations" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No pending invitations</Text>
      ) : (
        data.data.map((invitation) => (
          <Text key={invitation.id}>{formatInvitation(invitation)}</Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "invitation")}
      </Text>
    </Box>
  );
}

export function GroupInviteCommand({
  slug,
  body,
}: {
  slug: string;
  body: { user_id: number } | { email: string };
}) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/groups/{id}/invitations", {
        params: { path: { id: slug } },
        body,
      }),
    ),
  );

  if (loading) return <Spinner label="Inviting member" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return <GroupInviteOutcomeView response={data} />;
}

export function GroupRevokeInvitationCommand({
  slug,
  invitationId,
}: {
  slug: string;
  invitationId: number;
}) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/groups/{id}/invitations/{invitation_id}", {
      params: { path: { id: slug, invitation_id: invitationId } },
    });
    return { slug, invitationId };
  });

  if (loading) return <Spinner label="Revoking invitation" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Revoked invitation {data.invitationId}</Text>
    </Box>
  );
}

export function GroupInviteLinkCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.GET("/v3/groups/{id}/invite", {
        params: { path: { id: slug } },
      }),
    ),
  );

  if (loading) return <Spinner label="Loading invite link" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return <GroupInviteLinkView invite={data} />;
}

export function GroupCreateInviteLinkCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(() =>
    getData(
      client.POST("/v3/groups/{id}/invite", {
        params: { path: { id: slug } },
      }),
    ),
  );

  if (loading) return <Spinner label="Creating invite link" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return <GroupInviteLinkView invite={data} />;
}

export function GroupDeleteInviteLinkCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(async () => {
    await client.DELETE("/v3/groups/{id}/invite", {
      params: { path: { id: slug } },
    });
    return { slug };
  });

  if (loading) return <Spinner label="Deleting invite link" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted invite link for group {data.slug}</Text>
    </Box>
  );
}
