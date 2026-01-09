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
- Длинная память (важные события): 
${notesStr}

ТВОИ ПРАВИЛА:
1. ПОВЕСТВОВАНИЕ: Описывай мир через запахи, звуки и чувства. Будь непредсказуемым: добавляй иронию, трагедию и неожиданные встречи. 
2. ВНУТРЕННИЕ КУБИКИ: Для каждого сложного действия игрока ты должен «бросить d20» в уме. Описывай результат художественно.
3. ЕДИНСТВО МИРА: Помни всё, что было раньше. Отношение NPC зависит от прошлых поступков игрока.
4. ЗАПИСЬ СОБЫТИЙ: Если произошло что-то важное (новая репутация, герой кому-то насолил или помог), ОБЯЗАТЕЛЬНО добавь это в CHANGES в поле "note".
5. ЯЗЫК: Веди всё повествование и предлагай варианты ACTION только на языке пользователя (${lang}).

---
ACTION1: [Текст до 25 симв. + эмодзи]
ACTION2: [Текст до 25 симв. + эмодзи]
ACTION3: [Текст до 25 симв. + эмодзи]
CHANGES: {"hp": -10, "xp": 20, "learn": "Заклинание", "get": "Предмет", "note": "Краткая запись события"}
---

ВАЖНО: Кнопки ACTION должны предлагать варианты, основанные на способностях игрока (${spellsStr}). CHANGES пиши только при реальных переменах.`;

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
