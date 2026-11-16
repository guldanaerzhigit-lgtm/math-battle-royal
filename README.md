# Math Battle Royale

Math Battle Royale — браузерная математическая игра для 5–9 классов на React, Vite и Firebase.

## Игровые режимы

### Тренировка с ботами
Работает без Firebase. Игрок сражается с восемью ботами: они двигаются по арене, отвечают на задания, получают и теряют жизни, атакуют соперников и стараются оставаться в безопасной зоне.

### Онлайн SOLO / TEAM
Создайте комнату, отправьте пятизначный код другим игрокам и начните матч. Поддерживается до 30 участников. В TEAM участники автоматически распределяются между синей и красной командами.

## Игровой цикл

- Раунд длится 25 секунд.
- Для каждого класса с 5-го по 9-й подготовлен отдельный банк математических вопросов.
- Верный ответ даёт 100 XP и наносит урон ближайшему сопернику в радиусе атаки.
- Неверный ответ отнимает одну жизнь.
- Игрок, не ответивший до конца раунда, теряет одну жизнь.
- После раунда безопасная зона уменьшается. Игроки за её пределами теряют дополнительную жизнь.
- У каждого участника три жизни. В SOLO побеждает последний выживший; в TEAM — команда, у которой остались участники.
- Есть таблица лидеров, таймер, отображение жизней и кнопки управления для сенсорных экранов.

## Локальный запуск

Требуется Node.js 20 или новее.

```bash
npm install
npm run dev
```

Сборка:

```bash
npm run build
npm run preview
```

Кнопка «БОТТАРМЕН ЖАТТЫҒУ» запускает локальный режим без настройки Firebase.

## Firebase для онлайн-комнат

В `src/firebase.js` указаны параметры Firebase Web App. Чтобы включить онлайн-матчи:

1. В Firebase Console включите Authentication → Anonymous.
2. Создайте Cloud Firestore database.
3. Опубликуйте правила из `firestore.rules`.
4. Добавьте домен развернутого сайта в Firebase Authentication → Authorized domains.

При необходимости параметры проекта можно переопределить переменными `VITE_FIREBASE_*`.

## Cloudflare

Для Cloudflare Pages используйте:
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: 20+

При подключении репозитория к Cloudflare Pages новые коммиты ветки `main` запускают новое развертывание.

## Важное ограничение безопасности

Эта версия — полноценный игровой MVP, но не защищённая турнирная платформа. Клиентская часть пока обновляет часть состояния матча через Firestore. Для соревнований с призами или публичного турнира необходимо перенести проверку ответов, начисление очков, урон, таймер и решение о победителе на доверенный сервер (например, Cloud Functions или Cloudflare Workers/Durable Objects), а также ужесточить Firestore Security Rules.

## Teacher Studio: question bank and individual practice

Open the teacher dashboard at `/?teacher=1`. Select a class and use the **Оқу құралдары** panel:
- **Сұрақтар банкі** — create multiple-choice questions with a topic, difficulty, hint, simplified version, visual hint and step-by-step solution.
- **Excel/CSV import** — import `.xlsx`, `.xls` or `.csv` files. The dashboard provides an Excel template. One row is one question; use the columns `Сұрақ, A, B, C, D, Дұрыс жауап, Тақырып, Шешімі, Подсказка, Жеңілдетілген сұрақ, Визуалды ишара, Деңгей`. The correct answer may be A–D or 1–4.
- **Үй тапсырмасы** — select questions, set a deadline, and choose adaptive difficulty, hints, solutions, simplified wording, visual hints and extra time.
- **Тарих және есеп** — review homework attempts and class tournament rooms, then export an Excel report.

Students open `/?student=1`, join with the six-character class code, and complete assigned work individually. Practice assignments do not add students to a class leaderboard. Adaptive mode adjusts the next question level based on the previous answer and the result screen recommends other assignments covering weak topics.

### Firestore rules deployment

After updating the repository, publish the rules from `firestore.rules` in Firebase Console → Firestore Database → Rules. The new question bank, assignments and attempt records require these rules. The application build does not publish Firestore rules automatically.
