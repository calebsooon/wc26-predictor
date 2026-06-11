-- Add group_letter, dob, club columns to players table for FIFA squad data
alter table players add column if not exists group_letter text;
alter table players add column if not exists dob         date;
alter table players add column if not exists club        text;
