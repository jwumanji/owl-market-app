-- Emergency behavioral rollback for the One Piece TR reference trigger.
-- Run only after confirming the target project and capturing the failing write.

begin;

drop trigger if exists cards_sync_one_piece_tr_rarity_reference
  on public.cards;

notify pgrst, 'reload schema';

commit;
