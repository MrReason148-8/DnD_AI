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

        ctx.scene.state.age = age;

        await ctx.reply('Выбери пол своего героя:', Markup.inlineKeyboard([
            [Markup.button.callback('Мужской 🧔', 'gender_male')],
            [Markup.button.callback('Женский 👩', 'gender_female')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery || !ctx.callbackQuery.data.startsWith('gender_')) {
            return ctx.reply('Пожалуйста, выбери пол, нажав на кнопку.');
        }
        ctx.scene.state.gender = ctx.callbackQuery.data === 'gender_male' ? 'мужской' : 'женский';
        await ctx.answerCbQuery();

        await ctx.reply('Кто твой герой? Опиши его происхождение и способности (например: "Рыцарь-отступник, умеющий немного врачевать" или "Дочь лесного разбойника, мечтающая о магии").');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            return ctx.reply('Пожалуйста, опиши своего героя текстом.');
        }

        const background = ctx.message.text;
        const { name, age, gender } = ctx.scene.state;
        const chatId = ctx.from.id;

        // Сохраняем игрока в локальную БД
        let player = await playersDB.findOne({ chatId });
        const initialStats = {
            hp: 100,
            xp: 0,
            level: 1,
            background: background,
            gender: gender,
            spells: [],
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

        await ctx.reply(`Твоя история начинается, ${name}. Ты — ${background}. Удачи в приключениях!`);

        await handleGameTurn(ctx, player, 'Начни историю моего приключения, учитывая мое происхождение.');

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
        const changes = ai.parseChanges(aiResponse);

        // Очищаем текст от служебных тегов (все, что начинается с --- или ACTION/CHANGES)
        const cleanText = aiResponse
            .split('---')[0] // Берем только текст до разделителя, если он есть
            .replace(/ACTION\d:.*?\n?/g, '')
            .replace(/CHANGES:.*?\n?/g, '')
            .trim();

        // Применяем изменения, если они есть
        let statusMsg = '';
        if (changes) {
            if (changes.hp) {
                player.stats.hp = Math.max(0, Math.min(100, player.stats.hp + changes.hp));
                statusMsg += changes.hp > 0 ? `\n❤️ +${changes.hp} HP` : `\n💔 ${changes.hp} HP`;
            }
            if (changes.xp) {
                player.stats.xp += changes.xp;
                statusMsg += `\n⭐ +${changes.xp} XP`;
                // Простая логика уровней (каждые 100 XP)
                const nextLevel = Math.floor(player.stats.xp / 100) + 1;
                if (nextLevel > player.stats.level) {
                    player.stats.level = nextLevel;
                    statusMsg += `\n🎊 **УРОВЕНЬ ПОВЫШЕН: ${nextLevel}!**`;
                }
            }
            if (changes.get) {
                player.stats.inventory.push(changes.get);
                statusMsg += `\n🎒 Получено: ${changes.get}`;
            }
            if (changes.learn) {
                if (!player.stats.spells) player.stats.spells = [];
                player.stats.spells.push(changes.learn);
                statusMsg += `\n✨ Изучено заклинание: ${changes.learn}`;
            }
        }

        // Обновляем историю
        player.history.push({ role: 'user', content: userText });
        player.history.push({ role: 'assistant', content: aiResponse });

        if (player.history.length > 20) {
            player.history = player.history.slice(-20);
        }

        await playersDB.update({ chatId: player.chatId }, player);

        // Собираем кнопки действий
        const buttons = actions.map(a => [Markup.button.callback(a.text, a.id)]);

        // Всегда добавляем кнопку удаления игры в конец
        buttons.push([Markup.button.callback('🧹 Стереть весь прогресс игры', 'delete_game')]);

        const keyboard = Markup.inlineKeyboard(buttons);

        const finalMessage = statusMsg ? `${cleanText}\n\n*${statusMsg.trim()}*` : cleanText;

        if (keyboard) {
            await ctx.replyWithMarkdown(finalMessage, keyboard);
        } else {
            await ctx.replyWithMarkdown(finalMessage);
        }
    } catch (err) {
        console.error('AI Game Turn Error:', err);
        await ctx.reply('Ой, Гейм-мастер призадумался... Попробуй еще раз чуть позже.');
    }
}

// --- Обработчики ---

bot.command('stats', async (ctx) => {
    const player = await playersDB.findOne({ chatId: ctx.from.id });
    if (!player) return ctx.reply('Сначала зарегистрируйся: /start');

    const { stats, name } = player;
    const spellsStr = stats.spells && stats.spells.length > 0 ? stats.spells.join(', ') : 'Нет';
    const msg = `👤 **Герой: ${name}**\n` +
        `🧬 Пол: ${stats.gender} (${player.age} лет)\n` +
        `📜 Происхождение: ${stats.background}\n\n` +
        `❤️ HP: ${stats.hp}/100 | ⭐ Ур: ${stats.level} | 📈 Опыт: ${stats.xp}\n` +
        `✨ Заклинания: ${spellsStr}\n` +
        `🎒 Инвентарь: ${stats.inventory.length > 0 ? stats.inventory.join(', ') : 'Пусто'}`;

    await ctx.replyWithMarkdown(msg);
});

bot.command('start', (ctx) => {
    ctx.scene.enter('REGISTRATION_SCENE');
});

bot.on('callback_query', async (ctx) => {
    const chatId = ctx.from.id;
    const player = await playersDB.findOne({ chatId });

    if (!player) {
        return ctx.reply('Похоже, ты еще не зарегистрирован. Напиши /start');
    }

    if (ctx.callbackQuery.data === 'delete_game') {
        await playersDB.remove({ chatId }, { multi: false });
        await sessionsDB.remove({ key: `${ctx.from.id}:${ctx.chat.id}` }, { multi: false });
        await ctx.answerCbQuery('Прогресс стерт');
        return ctx.reply('Твоя история стерта. Чтобы начать новое приключение, напиши /start');
    }

    const actionText = ctx.callbackQuery.message.reply_markup.inline_keyboard
        .flat()
        .find(b => b.callback_data === ctx.callbackQuery.data)?.text;

    if (actionText) {
        await ctx.answerCbQuery();

        // Удаляем кнопки у текущего сообщения, чтобы нельзя было нажать дважды
        try {
            await ctx.editMessageReplyMarkup(null);
        } catch (e) {
            console.error('Failed to remove keyboard:', e);
        }

        await handleGameTurn(ctx, player, `Игрок выбрал: ${actionText}`);
    }
});

// Обработчик команды удаления
bot.command('delete', async (ctx) => {
    await playersDB.remove({ chatId: ctx.from.id }, { multi: false });
    await sessionsDB.remove({ key: `${ctx.from.id}:${ctx.chat.id}` }, { multi: false });
    await ctx.reply('Весь прогресс игры полностью удален. Напиши /start для новой регистрации.');
});

// Запуск
bot.launch();
console.log('🤖 D&D Bot (NeDB Mode) is running...');


// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
