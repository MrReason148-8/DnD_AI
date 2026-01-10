const OpenAI = require('openai');

class DeepSeekAI {
    constructor(apiKey) {
        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.deepseek.com'
        });
    }

    async generateResponse(player, userMessage) {
        const spellsStr = (player.stats.spells && player.stats.spells.length > 0) ? player.stats.spells.join(', ') : 'пока нет';
        const notesStr = (player.stats.notes && player.stats.notes.length > 0) ? player.stats.notes.join('\n- ') : 'пока пусто';
        const lang = player.stats.language || 'ru';

        const systemPrompt = `Ты — Мастер Подземелий (Game Master) мирового уровня. Твоя цель: создать незабываемое, глубокое и эмоциональное приключение.
ЯЗЫК ИГРЫ: ${lang === 'ru' ? 'Русский' : 'English'}. Отвечай СТРОГО на этом языке.

Данные игрока:
- Имя: ${player.name} (${player.stats.gender})
- Происхождение: ${player.stats.background}
- Способности: ${spellsStr}
- Длинная память: ${notesStr}

ТВОИ ПРАВИЛА:
1. ПОВЕСТВОВАНИЕ: Описывай мир через запахи, звуки и чувства. Будь непредсказуемым. Используй двойной перенос строки (\n\n) между абзацами.
2. НЕ ДУБЛИРУЙ: Категорически запрещено перечислять варианты действий в тексте истории. Игрок увидит их в кнопках.
3. ВНУТРЕННИЕ КУБИКИ: Бросай d20 в уме и описывай результат художественно. ОБЯЗАТЕЛЬНО оборачивай описание результата броска в теги <DICE>...</DICE>.
4. ТЕХНИЧЕСКИЙ БЛОК: В самом конце ответа ты ОБЯЗАН вывести блок строго в тегах <TECH>...</TECH>.

<TECH>
ACTION1: [Краткий глагол + эмодзи]
ACTION2: [Краткий глагол + эмодзи]
ACTION3: [Краткий глагол + эмодзи]
CHANGES: {"hp": -5, "xp": 10, "note": "Спас волка"}
</TECH>

ВАЖНО:
- Текст ACTION должен быть СТРОГО до 25 символов.
- ЗАПРЕЩЕНО писать пояснения в скобках в ACTION (например: "Осмотреться (в поисках еды)" — НЕЛЬЗЯ). Только действие: "Осмотреться 🔍".
- CHANGES пиши только при реальных переменах.
- Блок <DICE> содержит ТОЛЬКО художественное описание броска.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...player.history.slice(-10), // Последние 10 сообщений
            { role: 'user', content: userMessage }
        ];

        try {
            const response = await this.openai.chat.completions.create({
                model: 'deepseek-chat',
                messages: messages,
                temperature: 0.7
            });

            const content = response.choices[0].message.content;
            return content;
        } catch (err) {
            console.error('❌ DeepSeek API error:', err);
            throw err;
        }
    }

    parseActions(text) {
        // Ищем ACTION1: [Текст] или ACTION1: Текст
        const actionRegex = /ACTION(\d):\s*(?:\[)?(.*?)(?:\])?(?:\n|$)/g;
        const actions = [];
        let match;

        while ((match = actionRegex.exec(text)) !== null) {
            const actionText = match[2].trim();
            if (actionText) {
                actions.push({
                    id: `action_${match[1]} `,
                    text: actionText
                });
            }
        }
        return actions;
    }

    parseChanges(text) {
        const changesRegex = /CHANGES:\s*({.*?})/;
        const match = text.match(changesRegex);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch (err) {
                console.error('❌ Failed to parse CHANGES JSON:', err);
            }
        }
        return null;
    }
}

module.exports = DeepSeekAI;
