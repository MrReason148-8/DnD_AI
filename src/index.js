require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { playersDB, sessionsDB } = require('./db');
const DeepSeekAI = require('./ai');

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
        await ctx.reply('Приветствую, путник! Как величать твоего героя?');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            return ctx.reply('Пожалуйста, введи имя текстом.');
        }
        ctx.scene.state.name = ctx.message.text;
        await ctx.reply(`Приятно познакомиться, ${ctx.scene.state.name}. А сколько зим твоему герою?`);
        return ctx.wizard.next();
    },
    async (ctx) => {
        const age = parseInt(ctx.message.text);
        if (isNaN(age)) {
            return ctx.reply('Возраст должен быть числом. Попробуй еще раз.');
        }

        const chatId = ctx.from.id;
        const name = ctx.scene.state.name;

        // Сохраняем игрока в локальную БД
        let player = await playersDB.findOne({ chatId });
        if (!player) {
            player = { chatId, name, age, history: [], stats: { hp: 100, xp: 0, level: 1 } };
            await playersDB.insert(player);
        } else {
            player.name = name;
            player.age = age;
            player.history = []; // Сбрасываем историю при новой регистрации
            await playersDB.update({ chatId }, player);
        }

        await ctx.reply(`Персонаж ${name} (${age} лет) готов к приключениям! Начинаем историю...`);

        // Первая генерация сюжета
        await handleGameTurn(ctx, player, 'Начни историю моего приключения в темном фэнтези мире.');

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

    try {
        const aiResponse = await ai.generateResponse(player, userText);
        const actions = ai.parseActions(aiResponse);

        const cleanText = aiResponse.replace(/ACTION\d:.*?\n?/g, '').trim();

        // Обновляем историю
        player.history.push({ role: 'user', content: userText });
        player.history.push({ role: 'assistant', content: aiResponse });

        if (player.history.length > 20) {
            player.history = player.history.slice(-20);
        }

        await playersDB.update({ chatId: player.chatId }, player);

        const keyboard = actions.length > 0
            ? Markup.inlineKeyboard(actions.map(a => [Markup.button.callback(a.text, a.id)]))
            : null;

        if (keyboard) {
            await ctx.reply(cleanText, keyboard);
        } else {
            await ctx.reply(cleanText);
        }
    } catch (err) {
        console.error('AI Game Turn Error:', err);
        await ctx.reply('Ой, Гейм-мастер призадумался... Попробуй еще раз чуть позже.');
    }
}

// --- Обработчики ---

bot.command('start', (ctx) => {
    ctx.scene.enter('REGISTRATION_SCENE');
});

bot.on('callback_query', async (ctx) => {
    const chatId = ctx.from.id;
    const player = await playersDB.findOne({ chatId });

    if (!player) {
        return ctx.reply('Похоже, ты еще не зарегистрирован. Напиши /start');
    }

    const actionText = ctx.callbackQuery.message.reply_markup.inline_keyboard
        .flat()
        .find(b => b.callback_data === ctx.callbackQuery.data)?.text;

    if (actionText) {
        await ctx.answerCbQuery();
        await handleGameTurn(ctx, player, `Игрок выбрал: ${actionText}`);
    }
});

// Запуск
bot.launch();
console.log('🤖 D&D Bot (NeDB Mode) is running...');


// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
