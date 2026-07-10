# Что делать дальше: превратить проект в сайт

Ты уже создал Supabase-проект. Это база данных. Теперь надо сделать 4 вещи:

1. Создать таблицу в Supabase.
2. Взять Supabase URL и ключ.
3. Загрузить проект в GitHub.
4. Включить GitHub Pages.

Ниже пошагово.

## 1. Создать таблицу в Supabase

SQL - это просто готовая команда для Supabase. Тебе не надо понимать её смысл.

Сделай так:

1. В Supabase слева нажми иконку `SQL Editor`.
2. Нажми `New query`.
3. Открой файл на компьютере:

   ```text
   C:\Users\aipuc\Documents\Codex\2026-07-09\ghbd\supabase-schema.sql
   ```

4. Скопируй весь текст из файла.
5. Вставь в Supabase.
6. Нажми `Run`.

Готово. После этого в Supabase появится таблица `workspace_state`.

## 2. Взять Supabase URL и ключ

На твоём скрине уже виден URL проекта:

```text
https://kcsxspifrkuhbdmfahoy.supabase.co
```

Теперь нужен ключ:

1. В Supabase слева нажми шестерёнку `Project Settings`.
2. Открой `API`.
3. Найди `Project URL`.
4. Найди `anon public key`.

Сохрани оба значения. Они понадобятся в GitHub.

## 3. Загрузить проект в GitHub

У тебя уже есть GitHub repository:

```text
Flat-Reality/FRWorkspace
```

Самый простой способ загрузить проект:

1. Установи GitHub Desktop:

   ```text
   https://desktop.github.com
   ```

2. Открой GitHub Desktop.
3. Нажми `File`.
4. Нажми `Add local repository`.
5. Выбери папку:

   ```text
   C:\Users\aipuc\Documents\Codex\2026-07-09\ghbd
   ```

6. Если GitHub Desktop спросит, создать repository из этой папки - соглашайся.
7. Нажми `Publish repository` или `Push origin`.

Если repository `FRWorkspace` уже существует, GitHub Desktop может предложить привязать папку к нему.

## 4. Добавить Supabase-ключи в GitHub

Это нужно, чтобы GitHub смог собрать сайт уже с подключением к базе.

1. Открой repository `FRWorkspace` на GitHub.
2. Открой `Settings`.
3. Слева открой `Secrets and variables`.
4. Открой `Actions`.
5. Нажми `New repository secret`.

Создай первый secret:

```text
Name: VITE_SUPABASE_URL
Secret: https://kcsxspifrkuhbdmfahoy.supabase.co
```

Создай второй secret:

```text
Name: VITE_SUPABASE_ANON_KEY
Secret: сюда вставь anon public key из Supabase
```

## 5. Включить GitHub Pages

1. В GitHub repository открой `Settings`.
2. Слева открой `Pages`.
3. В разделе `Build and deployment` найди `Source`.
4. Выбери:

   ```text
   GitHub Actions
   ```

5. Сохрани, если GitHub попросит.

В проект уже добавлен файл:

```text
.github/workflows/deploy-pages.yml
```

Он автоматически собирает сайт и публикует его.

## 6. Запустить публикацию

После того как ты загрузишь проект в GitHub, GitHub сам запустит публикацию.

Проверить можно так:

1. Открой repository.
2. Нажми вкладку `Actions`.
3. Должен появиться процесс `Deploy GitHub Pages`.
4. Если он зелёный - сайт опубликован.

## 7. Подключить домен workspace.flatreality.eu

В проект уже добавлен файл:

```text
public/CNAME
```

В нём уже указано:

```text
workspace.flatreality.eu
```

Теперь в GitHub:

1. Repository `Settings`.
2. `Pages`.
3. В поле `Custom domain` напиши:

   ```text
   workspace.flatreality.eu
   ```

4. Нажми `Save`.

Потом у провайдера домена `flatreality.eu` создай DNS-запись:

```text
Type: CNAME
Name: workspace
Value: flat-reality.github.io
```

Если GitHub organization называется не `flat-reality`, а иначе, значение будет другое:

```text
ТВОЙ-АККАУНТ.github.io
```

## 8. Проверить сайт

Когда GitHub Pages и DNS заработают, открой:

```text
https://workspace.flatreality.eu
```

Если домен ещё не работает, GitHub Pages даст временную ссылку вида:

```text
https://flat-reality.github.io/FRWorkspace/
```

Но с custom domain основной адрес должен быть:

```text
https://workspace.flatreality.eu
```

## Как потом редактировать сайт

Самый простой процесс:

1. Пишешь мне, что изменить.
2. Я меняю файлы.
3. Ты открываешь GitHub Desktop.
4. Пишешь короткое название изменения, например:

   ```text
   update rewards page
   ```

5. Нажимаешь `Commit`.
6. Нажимаешь `Push origin`.
7. GitHub сам обновляет сайт через Actions.

## Важно

Сейчас это MVP. Он сохраняет данные в Supabase, но вход по Employment ID пока простой.

Для настоящей приватной рабочей системы следующим шагом надо будет добавить Supabase Auth и права доступа.
