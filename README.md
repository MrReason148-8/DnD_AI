# D&D AI Telegram Bot

Telegram-бот, который выступает в роли Game Master для D&D приключений, используя DeepSeek AI.

## Особенности
- Пошаговая регистрация героя (имя, возраст).
- Генерация сюжета через DeepSeek API (совместим с OpenAI SDK).
- Интерактивные кнопки для выбора действий.
- Сохранение истории игры и характеристик в MongoDB.

## Установка и запуск

1. **Клонируйте репозиторий**:
   ```bash
   git clone <your-repo-url>
   cd dnd-ai-bot
   ```

2. **Установите зависимости**:
   ```bash
   npm install
   ```

3. **Настройте переменные окружения**:
   Создайте файл `.env` в корне проекта (он игнорируется гитом):
   ```env
   BOT_TOKEN=ваш_токен_бота
   DEEPSEEK_API_KEY=ваш_ключ_deepseek
   MONGODB_URI=mongodb://localhost:27017/dnd_bot
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   ```

4. **Запустите бота**:
   ```bash
   npm start
   ```

## Деплой на хостинг
При использовании таких сервисов как Railway, Render или VPS:
1. Добавьте переменные из `.env` в панель управления хостинга (Environment Variables).
2. Подключите свой GitHub репозиторий.
3. Команда запуска: `npm start`.
