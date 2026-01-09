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
Игрок: ${player.name}, ${player.age} лет. 
Описывай мир атмосферно, но лаконично. 
В конце КАЖДОГО ответа ты ОБЯЗАН предложить 3 варианта действий в строгом формате:
ACTION1: [Текст действия]
ACTION2: [Текст действия]
ACTION3: [Текст действия]`;

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
        const actionRegex = /ACTION(\d):\s*\[(.*?)\]/g;
        const actions = [];
        let match;

        while ((match = actionRegex.exec(text)) !== null) {
            actions.push({
                id: `action_${match[1]}`,
                text: match[2].trim()
            });
        }

        // Если ИИ не выдал кнопки (редко, но бывает), вернем пустой массив или дефолт
        return actions;
    }
}

module.exports = DeepSeekAI;
