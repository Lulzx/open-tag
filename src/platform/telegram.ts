/**
 * Telegram platform adapter (grammY, long-polling).
 *
 * Flue's first-party channels are inbound-HTTP webhooks; Telegram long-polling
 * is "application-owned infrastructure" (Flue channels guide), so the platform
 * seam lives here, behind our normalized `PlatformAdapter`. New platform = new
 * file like this one; the product layer above never changes.
 */
import { Bot, type Context } from 'grammy';
import type { ReactionTypeEmoji } from 'grammy/types';
import type { AdapterFactory } from './registry.ts';
import type {
  IncomingMessage,
  MessageHandle,
  OutboundContent,
  PlatformAdapter,
  PlatformCaps,
  SendOpts,
} from './types.ts';

const TELEGRAM_CAPS: PlatformCaps = {
  threads: false, // Telegram uses reply-chains, not native threads.
  editMessages: true, // edit-in-place is how we "stream".
  richBlocks: false,
  maxMessageLen: 4096,
};

/** Telegram chat ids are numeric; @usernames are strings. Pass the right type. */
function chatRef(channelId: string): number | string {
  return /^-?\d+$/.test(channelId) ? Number(channelId) : channelId;
}

export class TelegramAdapter implements PlatformAdapter {
  readonly platform = 'telegram' as const;
  readonly caps = TELEGRAM_CAPS;

  private readonly bot: Bot;
  private handler?: (m: IncomingMessage) => void | Promise<void>;

  constructor(token: string) {
    this.bot = new Bot(token);
  }

  onMessage(handler: (m: IncomingMessage) => void | Promise<void>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.bot.init(); // populates bot.botInfo (id + username) for mention detection.
    const me = this.bot.botInfo;

    this.bot.on('message:text', async (ctx) => {
      if (!this.handler) return;
      const msg = this.normalize(ctx, me.id, me.username);
      try {
        await this.handler(msg);
      } catch (err) {
        console.error('[telegram] message handler failed:', err);
      }
    });

    // bot.start() runs the long-poll loop and its promise stays pending until
    // stop(); resolve start() once polling is live (via onStart) so other
    // adapters can start too. The loop keeps the process alive in the background.
    await new Promise<void>((resolve) => {
      void this.bot.start({
        drop_pending_updates: true,
        onStart: () => {
          console.log(`[telegram] @${me.username} polling…`);
          resolve();
        },
      });
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(channelId: string, content: OutboundContent, opts?: SendOpts): Promise<MessageHandle> {
    const sent = await this.bot.api.sendMessage(chatRef(channelId), content.text, {
      ...(opts?.replyTo ? { reply_parameters: { message_id: Number(opts.replyTo) } } : {}),
    });
    return { channelId, messageId: String(sent.message_id) };
  }

  async edit(handle: MessageHandle, content: OutboundContent): Promise<void> {
    await this.bot.api.editMessageText(chatRef(handle.channelId), Number(handle.messageId), content.text);
  }

  async react(handle: MessageHandle, emoji: string): Promise<void> {
    await this.bot.api.setMessageReaction(chatRef(handle.channelId), Number(handle.messageId), [
      { type: 'emoji', emoji: emoji as ReactionTypeEmoji['emoji'] },
    ]);
  }

  async isChannelAdmin(channelId: string, userId: string): Promise<boolean> {
    // A Telegram private chat's id equals the user's id — you own your own DM.
    if (channelId === userId) return true;
    try {
      const member = await this.bot.api.getChatMember(chatRef(channelId), Number(userId));
      return member.status === 'creator' || member.status === 'administrator';
    } catch (err) {
      console.error('[telegram] getChatMember failed:', err);
      return false;
    }
  }

  /** grammY context → normalized IncomingMessage. Called only for text messages. */
  private normalize(ctx: Context, botId: number, botUsername: string): IncomingMessage {
    const m = ctx.message!;
    const text = m.text ?? '';
    const isPrivate = ctx.chat?.type === 'private';
    const mention = `@${botUsername}`;
    const mentioned = text.includes(mention);
    const repliedToBot = m.reply_to_message?.from?.id === botId;

    const from = ctx.from;
    const userDisplay =
      [from?.first_name, from?.last_name].filter(Boolean).join(' ') ||
      from?.username ||
      'someone';

    // Strip the bot mention so the model doesn't see "@open_tag_bot" noise.
    const cleanText = text.split(mention).join('').trim();

    return {
      platform: 'telegram',
      channelId: String(ctx.chat!.id),
      threadId: m.reply_to_message ? String(m.reply_to_message.message_id) : undefined,
      messageId: String(m.message_id),
      userId: String(from?.id ?? 'unknown'),
      userDisplay,
      text: cleanText,
      mentionsBot: isPrivate || mentioned || repliedToBot,
      attachments: [],
      caps: TELEGRAM_CAPS,
      raw: ctx.update,
    };
  }
}

/** Registry entry — built when TELEGRAM_BOT_TOKEN is set (see registry.ts). */
export const telegramFactory: AdapterFactory = {
  platform: 'telegram',
  envHint: 'TELEGRAM_BOT_TOKEN',
  fromEnv: () =>
    process.env.TELEGRAM_BOT_TOKEN ? new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN) : null,
};
