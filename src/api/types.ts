import type { components } from "./schema";

type Schemas = components["schemas"];

export type Block = Schemas["Block"];
export type Channel = Schemas["Channel"];
export type ChannelRef = Schemas["Channel"];
export type Comment = Schemas["Comment"];
export type Connection = Schemas["Connection"];
export type Group = Schemas["Group"];
export type GroupInvite = Schemas["GroupInvite"];
export type GroupMember = Schemas["GroupMember"];
export type GroupMemberInviteResponse = Schemas["GroupMemberInviteResponse"];
export type MembershipInvitation = Schemas["MembershipInvitation"];
export type User = Schemas["User"];
export type Activity = Schemas["Activity"];
export type ActivityKind = Schemas["ActivityKind"];
export type ActivitySubject = Schemas["ActivitySubject"];
export type CursorMeta = Schemas["CursorMeta"];
export type FeedListResponse = Schemas["FeedListResponse"];
export type Notification = Schemas["Notification"];
export type NotificationListResponse = Schemas["NotificationListResponse"];

export type Connectable = Schemas["Block"] | Schemas["Channel"];
export type SearchResult =
  | Schemas["Block"]
  | Schemas["Channel"]
  | Schemas["User"]
  | Schemas["Group"];
export type Followable =
  | Schemas["User"]
  | Schemas["Channel"]
  | Schemas["Group"];

export type ConnectableType = Schemas["ConnectableType"];
export type Movement = Schemas["Movement"];
export type Visibility = Schemas["ChannelVisibility"];
export type ContentTypeFilter = Schemas["ContentTypeFilter"];
export type FollowableType = Schemas["FollowableType"];
export type SearchTypeFilter = Schemas["SearchTypeFilter"];
export type SearchSort = Schemas["SearchSort"];
export type SearchScope = Schemas["SearchScope"];
export type FileExtension = Schemas["FileExtension"];
export type ConnectionSort = Schemas["ConnectionSort"];
export type ChannelContentSort = Schemas["ChannelContentSort"];
export type ContentSort = Schemas["ContentSort"];
export type ConnectionFilter = Schemas["ConnectionFilter"];
export type UserTier = Schemas["UserTier"];
export type GroupSort = Schemas["GroupSort"];
export type Metadata = Schemas["Metadata"];
export type MetadataInput = Schemas["MetadataInput"];

export type PresignedFile = Schemas["PresignedFile"];
export type PaginationMeta = Schemas["PaginationMeta"];

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
