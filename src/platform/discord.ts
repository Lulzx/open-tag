/**
 * Discord platform adapter (discord.js, gateway/WebSocket).
 *
 * Proves the normalized seam (roadmap step 2): like Telegram, Discord is a
 * persistent gateway connection (application-owned infra, not a Flue HTTP
 * channel) with native edit-in-place. Adding it touched only this file and the
 * launcher's env selection — the product layer (`attachTeammate`) is unchanged.
 *
 * Requires the privileged "Message Content Intent" enabled in the Discord
 * Developer Portal for the bot to read message text in guild channels.
 */
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  type Message,
  type SendableChannels,
} from 'discord.js';
import type { AdapterFactory } from './registry.ts';
import type {
  IncomingMessage,
  MessageHandle,
  OutboundContent,
  PlatformAdapter,
  PlatformCaps,
  SendOpts,
} from './types.ts';

const DISCORD_CAPS: PlatformCaps = {
  threads: true,
  editMessages: true,
  richBlocks: false, // embeds exist; we emit plain markdown for now.
  maxMessageLen: 2000,
};

export class DiscordAdapter implements PlatformAdapter {
  readonly platform = 'discord' as const;
  readonly caps = DISCORD_CAPS;

  private readonly client: Client;
  private readonly token: string;
  private handler?: (m: IncomingMessage) => void | Promise<void>;
  // Cache sent messages so edit()/react() can act on them by id without a fetch.
  private readonly sent = new Map<string, Message>();

  constructor(token: string) {
    this.token = token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel], // required to receive DM events.
    });
  }

  onMessage(handler: (m: IncomingMessage) => void | Promise<void>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    this.client.on(Events.MessageCreate, async (message) => {
      if (!this.handler) return;
      if (message.author.bot) return; // ignore other bots and ourselves.
      if (!message.content) return;
      try {
        await this.handler(this.normalize(message));
      } catch (err) {
        console.error('[discord] message handler failed:', err);
      }
    });

    // login() resolves once connected; the gateway socket keeps the process alive.
    await new Promise<void>((resolve, reject) => {
      this.client.once(Events.ClientReady, (c) => {
        console.log(`[discord] logged in as ${c.user.tag}`);
        resolve();
      });
      this.client.login(this.token).catch(reject);
    });
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async send(channelId: string, content: OutboundContent, opts?: SendOpts): Promise<MessageHandle> {
    const channel = await this.sendableChannel(channelId);
    const sent = await channel.send({
      content: content.text,
      ...(opts?.replyTo
        ? { reply: { messageReference: opts.replyTo, failIfNotExists: false } }
        : {}),
    });
    this.sent.set(sent.id, sent);
    return { channelId, messageId: sent.id };
  }

  async edit(handle: MessageHandle, content: OutboundContent): Promise<void> {
    const message = await this.resolveMessage(handle);
    await message.edit({ content: content.text });
  }

  async react(handle: MessageHandle, emoji: string): Promise<void> {
    const message = await this.resolveMessage(handle);
    await message.react(emoji);
  }

  async isChannelAdmin(channelId: string, userId: string): Promise<boolean> {
    try {
      const channel =
        this.client.channels.cache.get(channelId) ?? (await this.client.channels.fetch(channelId));
      if (!channel || channel.isDMBased()) return true; // you own your own DM.
      if (!('guild' in channel) || !channel.guild) return false;
      const member = await channel.guild.members.fetch(userId);
      return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild)
      );
    } catch (err) {
      console.error('[discord] admin check failed:', err);
      return false;
    }
  }

  private async sendableChannel(channelId: string): Promise<SendableChannels> {
    const channel =
      this.client.channels.cache.get(channelId) ?? (await this.client.channels.fetch(channelId));
    if (!channel?.isSendable()) {
      throw new Error(`Discord channel ${channelId} is not a text channel we can send to.`);
    }
    return channel;
  }

  private async resolveMessage(handle: MessageHandle): Promise<Message> {
    const cached = this.sent.get(handle.messageId);
    if (cached) return cached;
    const channel = await this.sendableChannel(handle.channelId);
    return channel.messages.fetch(handle.messageId);
  }

  /** discord.js message → normalized IncomingMessage. Called only for text messages. */
  private normalize(message: Message): IncomingMessage {
    const botId = this.client.user?.id;
    const isDM = !message.guild;
    const mentioned = botId ? message.mentions.users.has(botId) : false;
    const repliedToBot = message.mentions.repliedUser?.id === botId && botId !== undefined;

    // Strip mention tokens (<@id> / <@!id>) so the model doesn't see raw IDs.
    let text = message.content;
    if (botId) {
      text = text.split(`<@${botId}>`).join('').split(`<@!${botId}>`).join('').trim();
    }

    const userDisplay =
      message.member?.displayName ?? message.author.globalName ?? message.author.username;

    return {
      platform: 'discord',
      channelId: message.channelId,
      threadId: message.reference?.messageId ?? undefined,
      messageId: message.id,
      userId: message.author.id,
      userDisplay,
      text,
      mentionsBot: isDM || mentioned || repliedToBot,
      attachments: [],
      caps: DISCORD_CAPS,
      raw: message,
    };
  }
}

/** Registry entry — built when DISCORD_BOT_TOKEN is set (see registry.ts). */
export const discordFactory: AdapterFactory = {
  platform: 'discord',
  envHint: 'DISCORD_BOT_TOKEN',
  fromEnv: () =>
    process.env.DISCORD_BOT_TOKEN ? new DiscordAdapter(process.env.DISCORD_BOT_TOKEN) : null,
};
