const OpenAI = require('openai');

class DeepSeekAI {
    constructor(apiKey) {
        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.deepseek.com'
        });
    }

    async generateResponse(player, userMessage) {
        const systemPrompt = `Ты Гейм-мастер в стиле D&D. 
Игрок: ${player.name}, ${player.age} лет, класс: ${player.stats.class}. 
Описывай мир атмосферно, но лаконично. 
В конце КАЖДОГО ответа ты ОБЯЗАН вывести технический блок (он будет вырезан ботом, поэтому не смешивай его с текстом истории):

---
ACTION1: [Текст]
ACTION2: [Текст]
ACTION3: [Текст]
CHANGES: {"hp": -10, "xp": 20}
---

ВАЖНО: Текст кнопок должен быть до 25 символов с эмодзи. Не пиши CHANGES, если изменений нет.`;

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
                    id: `action_${match[1]}`,
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
