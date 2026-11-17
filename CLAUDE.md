# Laravel API
Stack: Laravel 11, PHP 8.3, MySQL, Pest, Sanctum.

## Commands
- Tests: `php artisan test --filter=<Name>` (never run the full suite unless asked)
- Lint: `./vendor/bin/pint`
- Regenerate API docs: `php artisan scramble:export`

## Conventions
- Thin controllers; logic in `app/Actions` or `app/Services`
- Validation via FormRequest classes
- Responses via API Resources only
- Every endpoint change needs a Pest feature test
- Never edit existing migrations; add new ones

## Rules
- After changing an endpoint, regenerate the OpenAPI spec and tell me.
- Don't read `vendor/`, `storage/`, `bootstrap/cache/`.

## Database safety
- Never run anything that writes to or modifies the database without my explicit approval in this conversation. This includes: migrate (any variant), db:seed, tinker, raw SQL, factories outside tests, and any CLI client (mysql, psql).
- Writing migration files is fine. Running them is not. Tell me the command and wait.
- Before asking, state exactly what the command will change and which database it targets.
- Never run destructive commands (migrate:fresh, migrate:refresh, migrate:reset, db:wipe) even if approved earlier. Ask each time.
- Read-only queries (SELECT, `migrate:status`) are fine.