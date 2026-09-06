-- M03(누아&누키트) 부스 소개에 콜라보 파트너 누키트를 반영한다.
--
-- 0030에는 누아 단독 소개만 들어갔다. 이후 조사에서 누키트(nukit_official)가
-- M03 부스를 누아와 공동 운영하는 콜라보 파트너임을 확인했다(플로어맵 원본에도
-- M03 이름이 '누아&누키트'로 등록돼 있음, house_archive_corrections_log 5번).
-- E01(선데이플래닛47 X 레어로우) 콜라보 부스와 같은 방식으로 두 브랜드 소개를
-- " / {브랜드}: {소개}" 로 이어 붙인다. 대표 이미지·인스타는 기존 누아 것을
-- 그대로 쓴다(E01도 대표 브랜드 하나만 이미지·인스타로 노출).
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.

-- 1) 부스 본문.
update booth
   set description = 'about 누아 - 그저 미술이 좋아서 인생의 절반 이상의 시간 동안 그림을 그렸다. 이번 하우스 아카이브에서는 누키트와 함께 ''Mom''s palette''를 주제로 콜라보 부스를 운영한다. / 누키트: 감도 높은 아트워크로 라이프스타일 전반의 홈패브릭 아이템을 제안하는 브랜드. 이번 하우스 아카이브에서는 누아(@libere_nuage)와 ''Mom''s palette''를 주제로 M03 부스를 공동 운영한다.'
 where exhibition_id = 'exh_house_archive_2026'
   and code = 'M03';

-- 2) enrichment.
update booth_enrichment
   set summary             = 'about 누아 - 그저 미술이 좋아서 인생의 절반 이상의 시간 동안 그림을 그렸다. 이번 하우스 아카이브에서는 누키트와 함께 ''Mom''s palette''를 주제로 콜라보 부스를 운영한다. / 누키트: 감도 높은 아트워크로 라이프스타일 전반의 홈패브릭 아이템을 제안하는 브랜드. 이번 하우스 아카이브에서는 누아(@libere_nuage)와 ''Mom''s palette''를 주제로 M03 부스를 공동 운영한다.',
       roam_interpretation = '누아랑 누키트가 ''Mom''s palette''란 주제로 같이 여는 콜라보 부스야.',
       updated_at          = now()
 where booth_id = 'ha_m03';

-- 확인용:
--   select description from booth where exhibition_id='exh_house_archive_2026' and code='M03';
--   select roam_interpretation from booth_enrichment where booth_id='ha_m03';
