update public.player_tournament_records
set total_points =
  swiss_wins
  + case when top_cut_entry then 2 else 0 end
  + case when is_swiss_king then 5 else 0 end
  + case
      when final_placement = 1 then 10
      when final_placement = 2 then 8
      else 0
    end;
