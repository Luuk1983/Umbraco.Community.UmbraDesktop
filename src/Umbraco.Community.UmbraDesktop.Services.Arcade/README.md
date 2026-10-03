![UmbraDesktop](../Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Arcade service

High scores and leaderboards for UmbraDesktop games. This is a service package: you get it with a game that uses it, such as UmbraDesktop Entertainment, and do not need to install it yourself. Its audience is game authors who want their game on the Arcade.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Services.Arcade)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Services.Arcade) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](../../LICENSE)

## What it does

It keeps each player's best score on every board a game declares, shows the boards in an **Arcade** app in the launcher's Games group, asks players once whether their scores may be shown, and tells a player on their next visit when somebody took first place from them. A game gets all of it from one manifest and one call, and never imports this package.

## For game authors

- [Putting your game on the Arcade](docs/developer/putting-your-game-on-the-arcade.md): depend on this package, describe your boards, submit scores, and what the server accepts.
- [Arcade](docs/user/arcade.md): what players see.

The checks on a score are a sanity check, not security: the server accepts positive values inside a board's optional limits, and an administrator can remove the rest.

## Uninstalling

Umbraco has no uninstall hook for a package, so removing this package leaves its tables in your database. They are all named `umbraDesktopArcade...`, and the last one is the Arcade's own EF Core migrations history, so nothing else on the site is touched. To drop them, remove the package and run this against the site's database:

```sql
DROP TABLE umbraDesktopArcadeBeaten;
DROP TABLE umbraDesktopArcadeScore;
DROP TABLE umbraDesktopArcadeLeaderboard;
DROP TABLE umbraDesktopArcadeProfile;
DROP TABLE umbraDesktopArcadeMigrations;
```

Games that depend on this package stop working with it, so remove them first. Dropping the tables deletes every player's scores and cannot be undone. Without the package, the tables do no harm, so leaving them is the safe choice if you may reinstall.

## License

[MIT](../../LICENSE)
