# Contributing

Thanks for taking a look at Uzuza.

This is a product under active, fast moving development, so the guidance below is deliberately short. If you are working on the codebase directly, a few things will make that easier.

## Before you start

Open an issue describing what you plan to change before writing a lot of code, especially for anything touching contributions, payouts or custody. Those code paths handle real money and get extra scrutiny.

## Setting up

Follow the steps in the README to get a local environment running against your own Supabase project. Do not point a local environment at production data.

## Making a change

- Keep pull requests focused on one thing. A bug fix does not need a refactor riding along with it.
- Add a short, plain description of what changed and why in the pull request itself.
- If you touched anything financial (contributions, payouts, custody, the escalation logic for missed payments), say so explicitly and explain how you tested it.
- Run `npm run build` before opening a pull request. It runs the type checker along with the production build.

## Reporting a bug

Open an issue with what you expected, what happened instead, and the steps to reproduce it. If it involves a specific group or account, describe the state rather than sharing real phone numbers, emails or screenshots that contain other people's information.

## Security issues

If you find something that could expose user data or allow unauthorized access to funds, please do not open a public issue. Reach out directly instead so it can be fixed before anyone else finds it.
