import { config } from "../lib/config";
import type {
  Block,
  Channel,
  Comment,
  Connectable,
  ConnectableType,
  Connection,
  Followable,
  Group,
  Movement,
  PaginatedResponse,
  PresignedFile,
  SearchResult,
  User,
} from "./types";

const BASE_URL = "https://api.are.na";

export class ArenaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ArenaError";
    this.status = status;
  }
}

interface PaginationParams {
  page?: number;
  per?: number;
  sort?: string;
}

function buildQuery(params?: object): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

class ArenaClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = config.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}/v3${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options?.headers },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.error || body?.details?.message || response.statusText;
      throw new ArenaError(message, response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  // ── System ──

  async ping(): Promise<{ status: string }> {
    return this.request("/ping");
  }

  // ── Blocks ──

  async getBlock(id: number): Promise<Block> {
    return this.request(`/blocks/${id}`);
  }

  async createBlock(
    value: string,
    channelIds: (number | string)[],
    options?: {
      title?: string;
      description?: string;
      alt_text?: string;
    },
  ): Promise<Block> {
    return this.request("/blocks", {
      method: "POST",
      body: JSON.stringify({
        value,
        channel_ids: channelIds,
        ...options,
      }),
    });
  }

  async updateBlock(
    id: number,
    params: {
      title?: string;
      description?: string;
      content?: string;
      alt_text?: string;
    },
  ): Promise<Block> {
    return this.request(`/blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
  }

  async getBlockComments(
    id: number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<Comment>> {
    return this.request(`/blocks/${id}/comments${buildQuery(params)}`);
  }

  async getBlockConnections(
    id: number,
    params?: PaginationParams & { filter?: string },
  ): Promise<PaginatedResponse<Channel>> {
    return this.request(`/blocks/${id}/connections${buildQuery(params)}`);
  }

  // ── Comments ──

  async createComment(blockId: number, body: string): Promise<Comment> {
    return this.request(`/blocks/${blockId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async deleteComment(id: number): Promise<void> {
    return this.request(`/comments/${id}`, { method: "DELETE" });
  }

  // ── Channels ──

  async getChannel(idOrSlug: string | number): Promise<Channel> {
    return this.request(`/channels/${idOrSlug}`);
  }

  async getChannelContents(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<Connectable>> {
    const p = { sort: "position_desc", ...params };
    return this.request(`/channels/${idOrSlug}/contents${buildQuery(p)}`);
  }

  async createChannel(
    title: string,
    options?: {
      visibility?: "public" | "closed" | "private";
      description?: string;
      group_id?: number;
    },
  ): Promise<Channel> {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ title, ...options }),
    });
  }

  async updateChannel(
    idOrSlug: string | number,
    params: {
      title?: string;
      visibility?: "public" | "closed" | "private";
      description?: string | null;
    },
  ): Promise<Channel> {
    return this.request(`/channels/${idOrSlug}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
  }

  async deleteChannel(idOrSlug: string | number): Promise<void> {
    return this.request(`/channels/${idOrSlug}`, { method: "DELETE" });
  }

  async getChannelConnections(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<Channel>> {
    return this.request(
      `/channels/${idOrSlug}/connections${buildQuery(params)}`,
    );
  }

  async getChannelFollowers(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<User>> {
    return this.request(
      `/channels/${idOrSlug}/followers${buildQuery(params)}`,
    );
  }

  // ── Connections ──

  async connect(
    connectableId: number,
    channelIds: (number | string)[],
    connectableType: ConnectableType = "Block",
  ): Promise<void> {
    await this.request("/connections", {
      method: "POST",
      body: JSON.stringify({
        connectable_id: connectableId,
        connectable_type: connectableType,
        channel_ids: channelIds,
      }),
    });
  }

  async getConnection(id: number): Promise<Connection> {
    return this.request(`/connections/${id}`);
  }

  async deleteConnection(id: number): Promise<void> {
    return this.request(`/connections/${id}`, { method: "DELETE" });
  }

  async moveConnection(
    id: number,
    movement: Movement,
    position?: number,
  ): Promise<Connection> {
    return this.request(`/connections/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ movement, position }),
    });
  }

  // ── Users ──

  async getMe(): Promise<User> {
    return this.request("/me");
  }

  async getUser(idOrSlug: string | number): Promise<User> {
    return this.request(`/users/${idOrSlug}`);
  }

  async getUserContents(
    idOrSlug: string | number,
    params?: PaginationParams & { type?: string },
  ): Promise<PaginatedResponse<Connectable>> {
    return this.request(`/users/${idOrSlug}/contents${buildQuery(params)}`);
  }

  async getUserChannels(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<Channel>> {
    return this.request(
      `/users/${idOrSlug}/contents${buildQuery({ type: "Channel", ...params })}`,
    );
  }

  async getUserFollowers(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<User>> {
    return this.request(`/users/${idOrSlug}/followers${buildQuery(params)}`);
  }

  async getUserFollowing(
    idOrSlug: string | number,
    params?: PaginationParams & { type?: string },
  ): Promise<PaginatedResponse<Followable>> {
    return this.request(`/users/${idOrSlug}/following${buildQuery(params)}`);
  }

  // ── Groups ──

  async getGroup(idOrSlug: string | number): Promise<Group> {
    return this.request(`/groups/${idOrSlug}`);
  }

  async getGroupContents(
    idOrSlug: string | number,
    params?: PaginationParams & { type?: string },
  ): Promise<PaginatedResponse<Connectable>> {
    return this.request(`/groups/${idOrSlug}/contents${buildQuery(params)}`);
  }

  async getGroupFollowers(
    idOrSlug: string | number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<User>> {
    return this.request(`/groups/${idOrSlug}/followers${buildQuery(params)}`);
  }

  // ── Search ──

  async search(
    query: string,
    params?: {
      page?: number;
      per?: number;
      type?: string;
      sort?: string;
      scope?: string;
      user_id?: number;
      group_id?: number;
      channel_id?: number;
      ext?: string;
      after?: string;
      seed?: number;
    },
  ): Promise<PaginatedResponse<SearchResult>> {
    return this.request(`/search${buildQuery({ query, ...params })}`);
  }

  // ── Uploads ──

  async presignUpload(
    files: { filename: string; content_type: string }[],
  ): Promise<{ files: PresignedFile[]; expires_in: number }> {
    return this.request("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  }
}

export const arena = new ArenaClient();
