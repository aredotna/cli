import { config } from "../lib/config";
import type {
  Block,
  Channel,
  Connectable,
  PaginatedResponse,
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

    return response.json() as Promise<T>;
  }

  async getChannel(idOrSlug: string | number): Promise<Channel> {
    return this.request(`/channels/${idOrSlug}`);
  }

  async getChannelContents(
    idOrSlug: string | number,
    params?: { page?: number; per?: number; sort?: string },
  ): Promise<PaginatedResponse<Connectable>> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.per) q.set("per", String(params.per));
    q.set("sort", params?.sort || "position_desc");
    const qs = q.toString();
    return this.request(`/channels/${idOrSlug}/contents${qs ? `?${qs}` : ""}`);
  }

  async getBlock(id: number): Promise<Block> {
    return this.request(`/blocks/${id}`);
  }

  async search(
    query: string,
    params?: { page?: number; per?: number; type?: string; sort?: string },
  ): Promise<PaginatedResponse<SearchResult>> {
    const q = new URLSearchParams({ query });
    if (params?.page) q.set("page", String(params.page));
    if (params?.per) q.set("per", String(params.per));
    if (params?.type) q.set("type", params.type);
    if (params?.sort) q.set("sort", params.sort);
    return this.request(`/search?${q}`);
  }

  async createBlock(value: string, channelIds: number[]): Promise<Block> {
    return this.request("/blocks", {
      method: "POST",
      body: JSON.stringify({ value, channel_ids: channelIds }),
    });
  }

  async createChannel(
    title: string,
    status: "public" | "closed" | "private" = "closed",
  ): Promise<Channel> {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ title, status }),
    });
  }

  async connect(connectableId: number, channelIds: number[]): Promise<void> {
    await this.request("/connections", {
      method: "POST",
      body: JSON.stringify({
        connectable_id: connectableId,
        channel_ids: channelIds,
      }),
    });
  }

  async createComment(blockId: number, body: string): Promise<void> {
    await this.request(`/blocks/${blockId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async getMe(): Promise<User> {
    return this.request("/me");
  }

  async getUser(idOrSlug: string | number): Promise<User> {
    return this.request(`/users/${idOrSlug}`);
  }

  async getUserChannels(
    idOrSlug: string | number,
    params?: { page?: number; per?: number; sort?: string },
  ): Promise<PaginatedResponse<Channel>> {
    const q = new URLSearchParams({ type: "Channel" });
    if (params?.page) q.set("page", String(params.page));
    if (params?.per) q.set("per", String(params.per));
    if (params?.sort) q.set("sort", params.sort);
    return this.request(`/users/${idOrSlug}/contents?${q}`);
  }
}

export const arena = new ArenaClient();
