// Скрипты автоустановки команды kb. Отдаются Worker'ом по адресам /install и /install.ps1.
// Метка __ORIGIN__ заменяется на адрес Worker при выдаче.

const INSTALL_SH = `#!/bin/sh
# Research Centre: установка команды kb (Linux и macOS; bash, zsh, fish)
#
# Что делает этот скрипт:
#   1. определяет вашу оболочку;
#   2. добавляет в её файл настроек команду kb и автодополнение по Tab;
#   3. больше ничего не меняет и ничего не устанавливает.
#
# Прочитать до запуска:       curl -s __ORIGIN__/install | less
# Установить:                 curl -s __ORIGIN__/install | sh
# Удалить:                    curl -s __ORIGIN__/install | sh -s -- --uninstall
# Указать оболочку вручную:   curl -s __ORIGIN__/install | KB_SHELL=zsh sh

BASE="__ORIGIN__"
START="# >>> research-centre kb >>>"
END="# <<< research-centre kb <<<"
ACTION="install"
for arg in "$@"; do
  if [ "$arg" = "--uninstall" ]; then ACTION="uninstall"; fi
done

say() { printf '%s\\n' "$*"; }

say "Research Centre: команда kb"
say ""

if ! command -v curl >/dev/null 2>&1; then
  say "Не найден curl. Установите его (Debian/Ubuntu: sudo apt install curl, macOS: brew install curl) и запустите установку снова."
  exit 1
fi

SHELL_NAME="\${KB_SHELL:-$(basename "\${SHELL:-}")}"
case "$SHELL_NAME" in
  bash)
    if [ "$(uname)" = "Darwin" ] && [ ! -f "$HOME/.bashrc" ]; then RC="$HOME/.bash_profile"; else RC="$HOME/.bashrc"; fi ;;
  zsh) RC="\${ZDOTDIR:-$HOME}/.zshrc" ;;
  fish) RC="" ;;
  *)
    say "Не удалось определить оболочку (найдено: \${SHELL_NAME:-пусто}). Поддерживаются bash, zsh и fish."
    say "Укажите её вручную: curl -s $BASE/install | KB_SHELL=bash sh"
    exit 1 ;;
esac
FISH_DIR="\${XDG_CONFIG_HOME:-$HOME/.config}/fish"

# Убирает наш блок (между маркерами) и старый алиас kb из ручной установки
strip_block() {
  [ -f "$1" ] || return 0
  awk -v s="$START" -v e="$END" '
    $0 == s { skip = 1; next }
    $0 == e { skip = 0; next }
    skip { next }
    /^alias kb=.*\\/cli/ { next }
    { print }
  ' "$1" > "$1.kb-tmp" && cat "$1.kb-tmp" > "$1" && rm -f "$1.kb-tmp"
}

block_bash() {
  cat <<'KBEOF'
unalias kb 2>/dev/null
kb() { curl -sG --data-urlencode "q=$*" "__ORIGIN__/cli"; }
_kb_complete() {
  local cur prev opts
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$prev" = "cat" ]; then
    opts="$(curl -s --max-time 2 "__ORIGIN__/ids?type=cats")"
  else
    opts="-c -s -p -h cat list $(curl -s --max-time 2 "__ORIGIN__/ids")"
  fi
  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
}
complete -F _kb_complete kb
KBEOF
}

block_zsh() {
  cat <<'KBEOF'
unalias kb 2>/dev/null
kb() { curl -sG --data-urlencode "q=$*" "__ORIGIN__/cli"; }
_kb() {
  local -a opts
  if [[ "\${words[CURRENT-1]}" == "cat" ]]; then
    opts=(\${(f)"$(curl -s --max-time 2 "__ORIGIN__/ids?type=cats")"})
  else
    opts=(-c -s -p -h cat list \${(f)"$(curl -s --max-time 2 "__ORIGIN__/ids")"})
  fi
  compadd -- $opts
}
if (( $+functions[compdef] )); then
  compdef _kb kb
else
  autoload -Uz compinit && compinit -i && compdef _kb kb
fi
KBEOF
}

install_rc() {
  [ -f "$RC" ] || : > "$RC"
  [ -f "$RC.kb-backup" ] || cp "$RC" "$RC.kb-backup"
  if grep -q '^alias kb=.*/cli' "$RC" 2>/dev/null; then
    say "Найден старый алиас kb из ручной установки: он будет заменён новой версией."
  fi
  strip_block "$RC"
  {
    printf '\\n%s\\n' "$START"
    "$1"
    printf '%s\\n' "$END"
  } >> "$RC"
}

if [ "$ACTION" = "uninstall" ]; then
  if [ "$SHELL_NAME" = "fish" ]; then
    rm -f "$FISH_DIR/functions/kb.fish" "$FISH_DIR/completions/kb.fish"
    say "Файлы fish удалены: $FISH_DIR/functions/kb.fish и $FISH_DIR/completions/kb.fish"
  else
    strip_block "$RC"
    say "Блок kb удалён из $RC (копия до установки: $RC.kb-backup)."
  fi
  say "Откройте новый терминал, чтобы изменения вступили в силу."
  exit 0
fi

say "Оболочка: $SHELL_NAME"
case "$SHELL_NAME" in
  bash)
    say "Файл настроек: $RC"
    install_rc block_bash ;;
  zsh)
    say "Файл настроек: $RC"
    install_rc block_zsh ;;
  fish)
    say "Файлы: $FISH_DIR/functions/kb.fish и $FISH_DIR/completions/kb.fish"
    mkdir -p "$FISH_DIR/functions" "$FISH_DIR/completions"
    cat > "$FISH_DIR/functions/kb.fish" <<'KBEOF'
function kb --description 'Research Centre: база знаний'
    curl -sG --data-urlencode "q=$argv" "__ORIGIN__/cli"
end
KBEOF
    cat > "$FISH_DIR/completions/kb.fish" <<'KBEOF'
complete -c kb -f
complete -c kb -n "__fish_seen_subcommand_from cat" -a "(curl -s --max-time 2 '__ORIGIN__/ids?type=cats')"
complete -c kb -n "not __fish_seen_subcommand_from cat" -a "-c -s -p -h cat list"
complete -c kb -n "not __fish_seen_subcommand_from cat" -a "(curl -s --max-time 2 '__ORIGIN__/ids')"
KBEOF
    ;;
esac

say ""
say "Готово."
say ""
say "Что дальше:"
if [ "$SHELL_NAME" = "fish" ]; then
  say "  1. Откройте новую вкладку терминала (перезапуск не нужен)."
else
  say "  1. Откройте новый терминал или выполните: source $RC"
fi
say "  2. Проверьте: kb docker"
say "  3. Введите kb wire и нажмите Tab: подставится id статьи."
say "  4. Справка по флагам: kb -h"
say ""
say "Удалить: curl -s $BASE/install | sh -s -- --uninstall"
`;

const INSTALL_PS1 = `# Research Centre: установка команды kb (Windows PowerShell 5.1 и PowerShell 7)
#
# Что делает этот скрипт:
#   1. находит файл вашего профиля PowerShell (он выполняется при каждом запуске);
#   2. добавляет в него команду kb и автодополнение по Tab;
#   3. больше ничего не меняет и ничего не устанавливает.
#
# Прочитать до запуска:  irm __ORIGIN__/install.ps1
# Установить:            irm __ORIGIN__/install.ps1 | iex
# Удалить:               $env:KB_UNINSTALL = '1'; irm __ORIGIN__/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$kbStart = '# >>> research-centre kb >>>'
$kbEnd = '# <<< research-centre kb <<<'
$kbUninstall = ($env:KB_UNINSTALL -eq '1')

Write-Host 'Research Centre: команда kb' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    Write-Host 'Не найден curl.exe. Он встроен в Windows 10 (с версии 1803) и Windows 11. Обновите систему или используйте WSL.' -ForegroundColor Red
    return
}

$kbProfile = $PROFILE.CurrentUserCurrentHost
Write-Host ('Файл профиля: ' + $kbProfile)

$kbBlock = @'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function kb { curl.exe -sG --data-urlencode "q=$args" "__ORIGIN__/cli" }
Register-ArgumentCompleter -CommandName kb -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $typed = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
    if ($typed -contains 'cat') {
        $items = @(curl.exe -s --max-time 2 '__ORIGIN__/ids?type=cats')
    } else {
        $items = @('-c', '-s', '-p', '-h', 'cat', 'list') + @(curl.exe -s --max-time 2 '__ORIGIN__/ids')
    }
    $items | Where-Object { $_ -and ($_ -like ($wordToComplete + '*')) } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
'@

$kbKeep = @()
if (Test-Path $kbProfile) {
    if (-not (Test-Path ($kbProfile + '.kb-backup'))) {
        Copy-Item -Path $kbProfile -Destination ($kbProfile + '.kb-backup')
    }
    $kbSkip = $false
    foreach ($kbLine in (Get-Content -Path $kbProfile)) {
        if ($kbLine -eq $kbStart) { $kbSkip = $true; continue }
        if ($kbLine -eq $kbEnd) { $kbSkip = $false; continue }
        if (-not $kbSkip) { $kbKeep += $kbLine }
    }
} else {
    New-Item -Path $kbProfile -ItemType File -Force | Out-Null
}

if ($kbUninstall) {
    Set-Content -Path $kbProfile -Value $kbKeep -Encoding UTF8
    Write-Host 'Блок kb удалён из профиля. Откройте новое окно PowerShell.' -ForegroundColor Green
    return
}

$kbKeep += ''
$kbKeep += $kbStart
$kbKeep += ($kbBlock -split '\\r?\\n')
$kbKeep += $kbEnd
Set-Content -Path $kbProfile -Value $kbKeep -Encoding UTF8

Write-Host ''
Write-Host 'Готово.' -ForegroundColor Green
Write-Host ''
$kbPolicy = Get-ExecutionPolicy
if ($kbPolicy -eq 'Restricted' -or $kbPolicy -eq 'AllSigned') {
    Write-Host ('ВНИМАНИЕ: политика выполнения сценариев сейчас ' + $kbPolicy + ', профиль не будет загружаться.') -ForegroundColor Yellow
    Write-Host 'Разрешите свои сценарии (один раз, только для вашего пользователя):' -ForegroundColor Yellow
    Write-Host '  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned' -ForegroundColor Yellow
    Write-Host ''
}
Write-Host 'Что дальше:'
Write-Host '  1. Откройте новое окно PowerShell (или выполните: . $PROFILE)'
Write-Host '  2. Проверьте: kb docker'
Write-Host '  3. Введите kb wire и нажмите Tab: подставится id статьи.'
Write-Host '  4. Справка по флагам: kb -h'
Write-Host ''
Write-Host 'Если вы пользуетесь и Windows PowerShell 5.1, и PowerShell 7, запустите установку в каждом: у них разные профили.'
Write-Host 'Удалить: $env:KB_UNINSTALL = ''1''; irm __ORIGIN__/install.ps1 | iex'
`;

const fill = (tpl: string, origin: string) => tpl.split("__ORIGIN__").join(origin);

export const installSh = (origin: string) => fill(INSTALL_SH, origin);
export const installPs1 = (origin: string) => fill(INSTALL_PS1, origin);
