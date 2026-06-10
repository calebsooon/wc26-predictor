-- Add group_name and gameweek columns to matches
alter table matches add column if not exists group_name text;
alter table matches add column if not exists gameweek   integer;

-- ── Group A ──────────────────────────────────────────────────────────────────
update matches set group_name='A', gameweek=1 where home_team='MEX' and away_team='RSA';
update matches set group_name='A', gameweek=1 where home_team='KOR' and away_team='CZE';
update matches set group_name='A', gameweek=2 where home_team='CZE' and away_team='RSA';
update matches set group_name='A', gameweek=2 where home_team='MEX' and away_team='KOR';
update matches set group_name='A', gameweek=3 where home_team='CZE' and away_team='MEX';
update matches set group_name='A', gameweek=3 where home_team='RSA' and away_team='KOR';

-- ── Group B ──────────────────────────────────────────────────────────────────
update matches set group_name='B', gameweek=1 where home_team='CAN' and away_team='BIH';
update matches set group_name='B', gameweek=1 where home_team='QAT' and away_team='SUI';
update matches set group_name='B', gameweek=2 where home_team='SUI' and away_team='BIH';
update matches set group_name='B', gameweek=2 where home_team='CAN' and away_team='QAT';
update matches set group_name='B', gameweek=3 where home_team='SUI' and away_team='CAN';
update matches set group_name='B', gameweek=3 where home_team='BIH' and away_team='QAT';

-- ── Group C ──────────────────────────────────────────────────────────────────
update matches set group_name='C', gameweek=1 where home_team='BRA' and away_team='MAR';
update matches set group_name='C', gameweek=1 where home_team='HAI' and away_team='SCO';
update matches set group_name='C', gameweek=2 where home_team='SCO' and away_team='MAR';
update matches set group_name='C', gameweek=2 where home_team='BRA' and away_team='HAI';
update matches set group_name='C', gameweek=3 where home_team='SCO' and away_team='BRA';
update matches set group_name='C', gameweek=3 where home_team='MAR' and away_team='HAI';

-- ── Group D ──────────────────────────────────────────────────────────────────
update matches set group_name='D', gameweek=1 where home_team='USA' and away_team='PAR';
update matches set group_name='D', gameweek=1 where home_team='AUS' and away_team='TUR';
update matches set group_name='D', gameweek=2 where home_team='USA' and away_team='AUS';
update matches set group_name='D', gameweek=2 where home_team='TUR' and away_team='PAR';
update matches set group_name='D', gameweek=3 where home_team='TUR' and away_team='USA';
update matches set group_name='D', gameweek=3 where home_team='PAR' and away_team='AUS';

-- ── Group E ──────────────────────────────────────────────────────────────────
update matches set group_name='E', gameweek=1 where home_team='GER' and away_team='CUW';
update matches set group_name='E', gameweek=1 where home_team='CIV' and away_team='ECU';
update matches set group_name='E', gameweek=2 where home_team='GER' and away_team='CIV';
update matches set group_name='E', gameweek=2 where home_team='ECU' and away_team='CUW';
update matches set group_name='E', gameweek=3 where home_team='CUW' and away_team='CIV';
update matches set group_name='E', gameweek=3 where home_team='ECU' and away_team='GER';

-- ── Group F ──────────────────────────────────────────────────────────────────
update matches set group_name='F', gameweek=1 where home_team='NED' and away_team='JPN';
update matches set group_name='F', gameweek=1 where home_team='SWE' and away_team='TUN';
update matches set group_name='F', gameweek=2 where home_team='NED' and away_team='SWE';
update matches set group_name='F', gameweek=2 where home_team='TUN' and away_team='JPN';
update matches set group_name='F', gameweek=3 where home_team='JPN' and away_team='SWE';
update matches set group_name='F', gameweek=3 where home_team='TUN' and away_team='NED';

-- ── Group G ──────────────────────────────────────────────────────────────────
update matches set group_name='G', gameweek=1 where home_team='BEL' and away_team='EGY';
update matches set group_name='G', gameweek=1 where home_team='IRN' and away_team='NZL';
update matches set group_name='G', gameweek=2 where home_team='BEL' and away_team='IRN';
update matches set group_name='G', gameweek=2 where home_team='NZL' and away_team='EGY';
update matches set group_name='G', gameweek=3 where home_team='NZL' and away_team='BEL';
update matches set group_name='G', gameweek=3 where home_team='EGY' and away_team='IRN';

-- ── Group H ──────────────────────────────────────────────────────────────────
update matches set group_name='H', gameweek=1 where home_team='ESP' and away_team='CPV';
update matches set group_name='H', gameweek=1 where home_team='KSA' and away_team='URU';
update matches set group_name='H', gameweek=2 where home_team='ESP' and away_team='KSA';
update matches set group_name='H', gameweek=2 where home_team='URU' and away_team='CPV';
update matches set group_name='H', gameweek=3 where home_team='URU' and away_team='ESP';
update matches set group_name='H', gameweek=3 where home_team='CPV' and away_team='KSA';

-- ── Group I ──────────────────────────────────────────────────────────────────
update matches set group_name='I', gameweek=1 where home_team='FRA' and away_team='SEN';
update matches set group_name='I', gameweek=1 where home_team='IRQ' and away_team='NOR';
update matches set group_name='I', gameweek=2 where home_team='FRA' and away_team='IRQ';
update matches set group_name='I', gameweek=2 where home_team='NOR' and away_team='SEN';
update matches set group_name='I', gameweek=3 where home_team='NOR' and away_team='FRA';
update matches set group_name='I', gameweek=3 where home_team='SEN' and away_team='IRQ';

-- ── Group J ──────────────────────────────────────────────────────────────────
update matches set group_name='J', gameweek=1 where home_team='ARG' and away_team='ALG';
update matches set group_name='J', gameweek=1 where home_team='AUT' and away_team='JOR';
update matches set group_name='J', gameweek=2 where home_team='ARG' and away_team='AUT';
update matches set group_name='J', gameweek=2 where home_team='JOR' and away_team='ALG';
update matches set group_name='J', gameweek=3 where home_team='JOR' and away_team='ARG';
update matches set group_name='J', gameweek=3 where home_team='ALG' and away_team='AUT';

-- ── Group K ──────────────────────────────────────────────────────────────────
update matches set group_name='K', gameweek=1 where home_team='POR' and away_team='COD';
update matches set group_name='K', gameweek=1 where home_team='UZB' and away_team='COL';
update matches set group_name='K', gameweek=2 where home_team='POR' and away_team='UZB';
update matches set group_name='K', gameweek=2 where home_team='COL' and away_team='COD';
update matches set group_name='K', gameweek=3 where home_team='COL' and away_team='POR';
update matches set group_name='K', gameweek=3 where home_team='COD' and away_team='UZB';

-- ── Group L ──────────────────────────────────────────────────────────────────
update matches set group_name='L', gameweek=1 where home_team='ENG' and away_team='CRO';
update matches set group_name='L', gameweek=1 where home_team='GHA' and away_team='PAN';
update matches set group_name='L', gameweek=2 where home_team='ENG' and away_team='GHA';
update matches set group_name='L', gameweek=2 where home_team='PAN' and away_team='CRO';
update matches set group_name='L', gameweek=3 where home_team='PAN' and away_team='ENG';
update matches set group_name='L', gameweek=3 where home_team='CRO' and away_team='GHA';
