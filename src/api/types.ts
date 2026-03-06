export interface User {
  id: number;
  type: "User";
  name: string;
  slug: string;
  avatar: string;
  initials: string;
  bio?: Description | null;
  created_at?: string;
  updated_at?: string;
  counts?: {
    channels: number;
    followers: number;
    following: number;
  };
  channel_count?: number;
  following_count?: number;
  follower_count?: number;
}

export interface Owner {
  id: number;
  type: "User" | "Group";
  name: string;
  slug: string;
  avatar: string;
  initials: string;
}

export interface Description {
  markdown: string;
  html: string;
  plain: string;
}

export type BlockType = "Text" | "Image" | "Link" | "Attachment" | "Embed";
export type Visibility = "public" | "closed" | "private";

export interface Block {
  id: number;
  type: BlockType;
  base_type: "Block";
  title: string | null;
  content: Description | null;
  description: Description | null;
  state: string;
  visibility: Visibility;
  comment_count: number;
  created_at: string;
  updated_at: string;
  user: User;
  source: {
    url: string;
    title: string | null;
    provider: { name: string; url: string } | null;
  } | null;
  image: {
    src: string;
    filename: string;
    content_type: string;
    width: number;
    height: number;
    alt_text: string | null;
  } | null;
  attachment: {
    file_name: string;
    file_size: number;
    content_type: string;
    url: string;
  } | null;
  embed: {
    url: string;
    type: string;
    title: string | null;
    html: string | null;
  } | null;
  connected_at?: string;
  connected_by_user_id?: number;
  connection_id?: number;
  position?: number;
}

export interface Channel {
  id: number;
  type: "Channel";
  title: string;
  slug: string;
  visibility: Visibility;
  description: Description | null;
  state: string;
  created_at: string;
  updated_at: string;
  owner: Owner;
  counts: {
    blocks: number;
    channels: number;
    contents: number;
    collaborators: number;
  };
  can: {
    add_to: boolean;
    update: boolean;
    destroy: boolean;
    manage_collaborators: boolean;
  };
}

export interface ChannelRef {
  id: number;
  type: "Channel";
  title: string;
  slug: string;
  visibility: Visibility;
  counts: {
    contents: number;
  };
  created_at: string;
  updated_at: string;
  owner: Owner;
  connected_at?: string;
  connection_id?: number;
  position?: number;
}

export interface Comment {
  id: number;
  type: "Comment";
  body: Description | null;
  created_at: string;
  updated_at: string;
  user: User;
}

export interface Group {
  id: number;
  type: "Group";
  name: string;
  slug: string;
  avatar: string | null;
  initials: string;
  bio?: Description | null;
  created_at: string;
  updated_at: string;
  user: User;
  counts: {
    channels: number;
    users: number;
  };
}

export interface Connection {
  id: number;
  position: number;
  pinned: boolean;
  connected_at: string;
  connected_by: User | null;
  can: { remove: boolean };
}

export type ConnectableType = "Block" | "Channel";

export type Movement =
  | "insert_at"
  | "move_to_top"
  | "move_to_bottom"
  | "move_up"
  | "move_down";

export interface PresignedFile {
  upload_url: string;
  key: string;
  content_type: string;
}

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
  next_page: number | null;
  prev_page: number | null;
  has_more_pages: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export type Connectable = Block | ChannelRef;

export type SearchResult = Block | Channel | User;

export type Followable = User | Channel | Group;
