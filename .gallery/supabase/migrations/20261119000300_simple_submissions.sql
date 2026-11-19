alter table public.gallery_figures
  alter column recommendation set default '',
  alter column design_highlights set default '',
  drop constraint gallery_figures_recommendation_check,
  drop constraint gallery_figures_design_highlights_check,
  add constraint gallery_figures_recommendation_check check (char_length(recommendation) <= 2000),
  add constraint gallery_figures_design_highlights_check check (char_length(design_highlights) <= 1500);
