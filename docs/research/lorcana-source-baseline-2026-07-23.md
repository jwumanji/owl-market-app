# Lorcana source baseline — 2026-07-23

This is the result of a read-only full-source audit at
`2026-07-23T05:27:11Z`. No catalog, price, or image records were written.

## Source snapshot

| Metric | LorcanaJSON | JustTCG v1 |
| --- | ---: | ---: |
| Source version / game | format `2.3.4` (`current/en`) | `disney-lorcana` |
| Generated | `2026-07-17T14:42:30` | live |
| Sets | 18 | 19 |
| Card records | 3,226 | 3,496 |
| Cards with TCGplayer product ID | 2,933 | audited through card rows |
| Eligible Near Mint English variants | n/a | 6,002 |

JustTCG eligible finishes:

- 2,819 Normal
- 2,745 Cold Foil
- 438 Holofoil

These finishes must remain separate price observations.

## Exact-ID reconciliation

- Unique exact TCGplayer product-ID matches: 2,930
- Match rate across JustTCG card rows: 83.81%
- Withheld JustTCG rows: 566
  - 565 product IDs absent from the current LorcanaJSON snapshot
  - 1 non-unique product ID
- Exact normalized set-name matches: 15 of 19

The 19 JustTCG sets include three promo groupings that are cards embedded under
LorcanaJSON set codes rather than standalone LorcanaJSON sets. The remaining
name discrepancy is JustTCG `Reign of Jafar` versus LorcanaJSON
`The Reign of Jafar`. This should become an explicit reviewed alias if set-level
mapping needs it; it does not relax card price joins.

## Important gaps

`Attack of the Vine!` accounts for 258 JustTCG card rows and currently has zero
exact matches because its product IDs are not in the `2026-07-17` LorcanaJSON
snapshot. It must remain provider-ahead staging data.

TCGplayer product ID `601112` is non-unique in LorcanaJSON:

| LorcanaJSON ID | Full identifier | Name |
| ---: | --- | --- |
| 1,433 | `26/P2 • EN • 7` | Moana - Adventurer of Land and Sea |
| 1,663 | `26/P2 • EN • 7` | Vaiana - Adventurer of Land and Sea |

Both rows use the same printing identifier and product ID. The staged adapter
quarantines the product rather than selecting one localized name.

## Decision

The data is good enough to begin a private text-first catalog and raw commercial
reconciliation. It is not ready for automatic public publication.

The next engineering slice should persist raw source records and reconciliation
candidates, then explicitly classify the 566 withheld rows. Price publication
and card image writes remain separate approval gates.
