require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { connectDB, Player } = require('./db');
const DeepSeekAI = require('./ai');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ai = new DeepSeekAI(process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_BASE_URL);

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

        // Сохраняем игрока в БД
        let player = await Player.findOne({ chatId });
        if (!player) {
            player = new Player({ chatId, name, age });
        } else {
            player.name = name;
            player.age = age;
            player.history = []; // Сбрасываем историю при новой регистрации
        }
        await player.save();

        await ctx.reply(`Персонаж ${name} (${age} лет) готов к приключениям! Начинаем историю...`);

        // Первая генерация сюжета
        await handleGameTurn(ctx, player, 'Начни историю моего приключения в темном фэнтези мире.');

        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([registrationWizard]);

// --- Middleware ---
bot.use(session());
bot.use(stage.middleware());

// --- Функции игры ---

async function handleGameTurn(ctx, player, userText) {
    await ctx.sendChatAction('typing');

    try {
        const aiResponse = await ai.generateResponse(player, userText);
        const actions = ai.parseActions(aiResponse);

        // Удаляем технические строки ACTION из текста для пользователя
        const cleanText = aiResponse.replace(/ACTION\d:.*?\n?/g, '').trim();

        // Обновляем историю в БД
        player.history.push({ role: 'user', content: userText });
        player.history.push({ role: 'assistant', content: aiResponse });

        // Ограничиваем историю (например, последние 20 сообщений)
        if (player.history.length > 20) {
            player.history = player.history.slice(-20);
        }
        await player.save();

        const keyboard = actions.length > 0
            ? Markup.inlineKeyboard(actions.map(a => [Markup.button.callback(a.text, a.id)]))
            : null;

        if (keyboard) {
            await ctx.reply(cleanText, keyboard);
        } else {
            await ctx.reply(cleanText);
        }
    } catch (err) {
        console.error(err);
        await ctx.reply('Ой, Гейм-мастер призадумался... Попробуй еще раз чуть позже.');
    }
}

// --- Обработчики ---

bot.command('start', (ctx) => {
    ctx.scene.enter('REGISTRATION_SCENE');
});

bot.on('callback_query', async (ctx) => {
    const chatId = ctx.from.id;
    const player = await Player.findOne({ chatId });

    if (!player) {
        return ctx.reply('Похоже, ты еще не зарегистрирован. Напиши /start');
    }

    // Находим текст кнопки, которую нажал игрок
    // В реальном приложении лучше искать по ID действия, но для простоты возьмем текст из текущего сообщения
    const actionText = ctx.callbackQuery.message.reply_markup.inline_keyboard
        .flat()
        .find(b => b.callback_data === ctx.callbackQuery.data)?.text;

    if (actionText) {
        await ctx.answerCbQuery();
        await handleGameTurn(ctx, player, `Игрок выбрал: ${actionText}`);
    }
});

// Запуск
async function init() {
    await connectDB(process.env.MONGODB_URI);
    bot.launch();
    console.log('🤖 D&D Bot is running...');
}

init();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
