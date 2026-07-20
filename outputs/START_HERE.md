# Flat Reality Workspace: запуск и публикация

Проект лежит здесь:

`C:\Users\aipuc\Documents\Codex\2026-07-09\ghbd`

## Локальный запуск

```bash
npm install
npm run dev
```

Открой:

```text
http://localhost:5173
```

ID для входа:

```text
FR-1001
FR-ADMIN
```

## Что уже подготовлено

- темно-фиолетовый акцент вместо зеленого;
- мобильная версия;
- страница LevelUp! в боковом меню;
- Work Records с account health и таймлайном;
- Request explanation workflow для HR и пользователей;
- Signed Documents открывает подписанные документы по ссылкам;
- пустые страницы Benefits и Installs подготовлены;
- Career Growth показывает текущий seniority;
- Admin перестроен на модули HR, Guide Writting и LevelUp! Configurator;
- Supabase-сохранение через таблицу `workspace_state`;
- GitHub Pages custom domain файл `public/CNAME`;
- домен: `workspace.flatreality.eu`.

## Где редактировать

- Главный интерфейс: `src/App.tsx`
- Начальные данные: `src/data.ts`
- Типы данных: `src/types.ts`
- Supabase-сохранение: `src/storage.ts`
- Схема базы: `supabase-schema.sql`
- Цвета: `tailwind.config.ts`

## Как работает сохранение

Если Supabase не подключен, изменения сохраняются локально в браузере.

Если Supabase подключен через `.env.production`, изменения сохраняются в таблицу `workspace_state` и будут доступны после обновления страницы и с других устройств.
