require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { playersDB, sessionsDB } = require('./db');
const DeepSeekAI = require('./ai');
const i18n = require('./i18n');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ai = new DeepSeekAI(process.env.DEEPSEEK_API_KEY);

// --- Middleware для персистентных сессий через NeDB ---
const localSession = async (ctx, next) => {
    const key = ctx.from ? `${ctx.from.id}:${ctx.chat.id}` : null;
    if (!key) return next();

    let sessionData = await sessionsDB.findOne({ key });
    ctx.session = sessionData ? sessionData.data : {};

    await next();

    await sessionsDB.update({ key }, { key, data: ctx.session }, { upsert: true });
};

// --- Сцены ---

const registrationWizard = new Scenes.WizardScene(
    'REGISTRATION_SCENE',
    async (ctx) => {
        // Шаг 1: Приветствие и выбор языка
        const name = ctx.from.first_name || 'Путник';
        await ctx.reply(`Привет, ${name}! 👋\nВыбери язык для игры / Choose your language:`, Markup.inlineKeyboard([
            [Markup.button.callback('🇷🇺 Русский', 'lang_ru')],
            [Markup.button.callback('🇺🇸 English', 'lang_en')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Шаг 2: Объяснение и запрос имени
        if (!ctx.callbackQuery || !ctx.callbackQuery.data.startsWith('lang_')) {
            return ctx.reply('Пожалуйста, выбери язык / Please choose a language.');
        }
        const lang = ctx.callbackQuery.data.split('_')[1];
        ctx.scene.state.lang = lang;
        const t = i18n[lang];

        await ctx.answerCbQuery();
        await ctx.reply(t.intro);
        await ctx.reply(t.ask_name);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Шаг 3: Возраст
        const lang = ctx.scene.state.lang;
        const t = i18n[lang];

        if (!ctx.message || !ctx.message.text) {
            return ctx.reply(t.error_name);
        }
        ctx.scene.state.name = ctx.message.text;
        await ctx.reply(t.ask_age);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Шаг 4: Пол
        const lang = ctx.scene.state.lang;
        const t = i18n[lang];
        const age = parseInt(ctx.message.text);

        if (isNaN(age)) {
            return ctx.reply(t.error_age);
        }
        ctx.scene.state.age = age;

        await ctx.reply(t.ask_gender, Markup.inlineKeyboard([
            [Markup.button.callback(t.gender_male, 'gender_male')],
            [Markup.button.callback(t.gender_female, 'gender_female')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Шаг 5: Происхождение
        const lang = ctx.scene.state.lang;
        const t = i18n[lang];

        if (!ctx.callbackQuery || !ctx.callbackQuery.data.startsWith('gender_')) {
            return ctx.reply(t.error_gender);
        }
        ctx.scene.state.gender = ctx.callbackQuery.data === 'gender_male' ? (lang === 'ru' ? 'мужской' : 'male') : (lang === 'ru' ? 'женский' : 'female');
        await ctx.answerCbQuery();

        await ctx.reply(t.ask_background);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Шаг 6: Финал и запуск
        const lang = ctx.scene.state.lang;
        const t = i18n[lang];

        if (!ctx.message || !ctx.message.text) {
            return ctx.reply(t.error_background);
        }

        const background = ctx.message.text;
        const { name, age, gender } = ctx.scene.state;
        const chatId = ctx.from.id;

        let player = await playersDB.findOne({ chatId });
        const initialStats = {
            hp: 100,
            xp: 0,
            level: 1,
            background: background,
            gender: gender,
            language: lang,
            spells: [],
            notes: [],
            inventory: []
        };

        if (!player) {
            player = { chatId, name, age, history: [], stats: initialStats };
            await playersDB.insert(player);
        } else {
            player.name = name;
            player.age = age;
            player.stats = initialStats;
            player.history = [];
            await playersDB.update({ chatId }, player);
        }

        await ctx.reply(t.start_adventure(name, background));
        const startPrompt = lang === 'ru' ? 'Начни историю моего приключения, учитывая мое происхождение.' : 'Start the story of my adventure, considering my background.';
        await handleGameTurn(ctx, player, startPrompt);

        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([registrationWizard]);

// --- Применяем Middleware ---
bot.use(localSession); // Наша кастомная сессия через NeDB
bot.use(stage.middleware());

// --- Функции игры ---

async function handleGameTurn(ctx, player, userText) {
    await ctx.sendChatAction('typing');
    const lang = player.stats.language || 'ru';
    const t = i18n[lang];

    try {
        const aiResponse = await ai.generateResponse(player, userText);
        const actions = ai.parseActions(aiResponse);
        const changes = ai.parseChanges(aiResponse);

        const cleanText = aiResponse
            .split('<TECH>')[0] // Отрезаем всё, что после тега <TECH>
            .replace(/<TECH>|<\/TECH>/g, '') // На всякий случай убираем сами теги
            .replace(/ACTION\d:.*?\n?/g, '')
            .replace(/CHANGES:.*?\n?/g, '')
            .trim();

        let statusMsg = '';
        if (changes) {
            if (changes.hp) {
                player.stats.hp = Math.max(0, Math.min(100, player.stats.hp + changes.hp));
                statusMsg += changes.hp > 0 ? `\n❤️ +${changes.hp} HP` : `\n💔 ${changes.hp} HP`;
            }
            if (changes.xp) {
                player.stats.xp += changes.xp;
                statusMsg += `\n⭐ +${changes.xp} XP`;
                const nextLevel = Math.floor(player.stats.xp / 100) + 1;
                if (nextLevel > player.stats.level) {
                    player.stats.level = nextLevel;
                    statusMsg += lang === 'ru' ? `\n🎊 **УРОВЕНЬ ПОВЫШЕН: ${nextLevel}!**` : `\n🎊 **LEVEL UP: ${nextLevel}!**`;
                }
            }
            if (changes.get) {
                player.stats.inventory.push(changes.get);
                statusMsg += lang === 'ru' ? `\n🎒 Получено: ${changes.get}` : `\n🎒 Obtained: ${changes.get}`;
            }
            if (changes.learn) {
                if (!player.stats.spells) player.stats.spells = [];
                player.stats.spells.push(changes.learn);
                statusMsg += lang === 'ru' ? `\n✨ Изучено заклинание: ${changes.learn}` : `\n✨ Learned spell: ${changes.learn}`;
            }
            if (changes.note) {
                if (!player.stats.notes) player.stats.notes = [];
                player.stats.notes.push(changes.note);
                if (player.stats.notes.length > 30) player.stats.notes.shift();
            }
        }

        player.history.push({ role: 'user', content: userText });
        player.history.push({ role: 'assistant', content: aiResponse });
        if (player.history.length > 20) player.history = player.history.slice(-20);

        await playersDB.update({ chatId: player.chatId }, player);

        const buttons = actions.map(a => [Markup.button.callback(a.text, a.id)]);
        buttons.push([Markup.button.callback(t.delete_btn, 'delete_game')]);

        const keyboard = Markup.inlineKeyboard(buttons);
        const finalMessage = statusMsg ? `${cleanText}\n\n*${statusMsg.trim()}*` : cleanText;

        if (keyboard) {
            await ctx.replyWithMarkdown(finalMessage, keyboard);
        } else {
            await ctx.replyWithMarkdown(finalMessage);
        }
    } catch (err) {
        console.error('AI Game Turn Error:', err);
        const errMsg = lang === 'ru' ? 'Ой, Гейм-мастер призадумался... Попробуй еще раз чуть позже.' : 'Oops, the Game Master is thinking too hard... Try again later.';
        await ctx.reply(errMsg);
    }
}

// --- Обработчики ---

bot.command('stats', async (ctx) => {
    const player = await playersDB.findOne({ chatId: ctx.from.id });
    if (!player) return ctx.reply('Please register first: /start');

    const lang = player.stats.language || 'ru';
    const t = i18n[lang];
    const { stats, name } = player;
    const spellsStr = stats.spells && stats.spells.length > 0 ? stats.spells.join(', ') : t.stats_none;

    const msg = `${t.stats_header(name)}\n` +
        `${t.stats_gender}: ${stats.gender} (${player.age})\n` +
        `${t.stats_bg}: ${stats.background}\n\n` +
        `❤️ HP: ${stats.hp}/100 | ⭐ Level: ${stats.level} | 📈 XP: ${stats.xp}\n` +
        `${t.stats_spells}: ${spellsStr}\n` +
        `${t.stats_inv}: ${stats.inventory.length > 0 ? stats.inventory.join(', ') : t.stats_empty}`;

    await ctx.replyWithMarkdown(msg);
});

bot.command('start', async (ctx) => {
    await ctx.scene.enter('REGISTRATION_SCENE');
});

bot.on('callback_query', async (ctx) => {
    const chatId = ctx.from.id;
    const player = await playersDB.findOne({ chatId });

    if (ctx.callbackQuery.data === 'delete_game') {
        const lang = player ? player.stats.language : 'ru';
        await playersDB.remove({ chatId }, { multi: false });
        await sessionsDB.remove({ key: `${ctx.from.id}:${ctx.chat.id}` }, { multi: false });
        await ctx.answerCbQuery();
        return ctx.reply(i18n[lang].delete_confirm);
    }

    if (!player) return;

    const actionText = ctx.callbackQuery.message.reply_markup.inline_keyboard
        .flat()
        .find(b => b.callback_data === ctx.callbackQuery.data)?.text;

    if (actionText) {
        await ctx.answerCbQuery();
        try {
            await ctx.editMessageReplyMarkup(null);
        } catch (e) { }
        await handleGameTurn(ctx, player, `Player selected: ${actionText}`);
    }
});

bot.command('delete', async (ctx) => {
    const player = await playersDB.findOne({ chatId: ctx.from.id });
    const lang = player ? player.stats.language : 'ru';
    await playersDB.remove({ chatId: ctx.from.id }, { multi: false });
    await sessionsDB.remove({ key: `${ctx.from.id}:${ctx.chat.id}` }, { multi: false });
    await ctx.reply(i18n[lang].delete_confirm);
});

// Запуск
bot.launch();
console.log('🤖 D&D Bot is running...');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
