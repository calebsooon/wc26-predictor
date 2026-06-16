alter table profiles add column if not exists theme text check (theme in ('light', 'dark'));
