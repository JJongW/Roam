-- 0007: booth.kind (facility classification) + booth.aliases (co-located exhibitors)
-- Generated from src/lib/mock/seed.ts so prod data matches the app's verified
-- SIBF directory reconciliation + organizer-provided special-space names. Idempotent.

alter table booth add column if not exists kind    text  not null default 'exhibitor';
alter table booth add column if not exists aliases jsonb not null default '[]'::jsonb;

-- 15 facility slots: lounges/stages/special spaces/F&B, not participating publishers.
update booth set kind='facility', name='일러스트레이트 월', company='부대 공간', aliases='[]'::jsonb, long_description='일러스트레이트 월 · A113. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A113';
update booth set kind='facility', name='연사 라운지1', company='부대 공간', aliases='[]'::jsonb, long_description='연사 라운지1 · A1807. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A1807';
update booth set kind='facility', name='책만남홀2', company='부대 공간', aliases='[]'::jsonb, long_description='책만남홀2 · A1901. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A1901';
update booth set kind='facility', name='아트숍', company='부대 공간', aliases='[]'::jsonb, long_description='아트숍 · A1902. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A1902';
update booth set kind='facility', name='연사 라운지2', company='부대 공간', aliases='[]'::jsonb, long_description='연사 라운지2 · A1903. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A1903';
update booth set kind='facility', name='책만남홀1', company='부대 공간', aliases='[]'::jsonb, long_description='책만남홀1 · A2402. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='A2402';
update booth set kind='facility', name='SIBF x 글<페이지 사이의 우체국>', company='부대 공간', aliases='[]'::jsonb, long_description='SIBF x 글<페이지 사이의 우체국> · B207. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B207';
update booth set kind='facility', name='책마을', company='부대 공간', aliases='[]'::jsonb, long_description='책마을 · B400. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B400';
update booth set kind='facility', name='커피 리브레', company='부대 공간', aliases='[]'::jsonb, long_description='커피 리브레 · B701. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B701';
update booth set kind='facility', name='BBK x SIBF 책 라운지 with 일룸', company='부대 공간', aliases='[]'::jsonb, long_description='BBK x SIBF 책 라운지 with 일룸 · B702. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B702';
update booth set kind='facility', name='주제전시', company='부대 공간', aliases='[]'::jsonb, long_description='주제전시 · B703. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B703';
update booth set kind='facility', name='책마당', company='부대 공간', aliases='[]'::jsonb, long_description='책마당 · B704. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B704';
update booth set kind='facility', name='프레스콜', company='부대 공간', aliases='[]'::jsonb, long_description='프레스콜 · B705. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B705';
update booth set kind='facility', name='연사 라운지3', company='부대 공간', aliases='[]'::jsonb, long_description='연사 라운지3 · B706. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B706';
update booth set kind='facility', name='연사 라운지', company='부대 공간', aliases='[]'::jsonb, long_description='연사 라운지 · B707. 참가사 부스가 아닌 행사장 부대 공간이에요.' where code='B707';

-- 37 booths with co-located exhibitors sharing the code.
update booth set aliases='["애플트리태일즈"]'::jsonb where code='A107';
update booth set aliases='["곰세마리"]'::jsonb where code='A108';
update booth set aliases='["사월의눈","미디어버스"]'::jsonb where code='A202';
update booth set aliases='["목요일출판사","니케북스"]'::jsonb where code='A209';
update booth set aliases='["한국과학기술출판협회"]'::jsonb where code='A308';
update booth set aliases='["이야기장수"]'::jsonb where code='A501';
update booth set aliases='["주한프랑스대사관 문화과"]'::jsonb where code='A601';
update booth set aliases='["고래인"]'::jsonb where code='A709';
update booth set aliases='["씨엘미디어","뮤트스튜디오","냥이의야옹","공공북스","고양이함수","부산출판문화산업협회"]'::jsonb where code='A801';
update booth set aliases='["보스토크 프레스"]'::jsonb where code='A807';
update booth set aliases='["돌베개"]'::jsonb where code='A1001';
update booth set aliases='["민음사 출판그룹"]'::jsonb where code='A1101';
update booth set aliases='["인플루엔셜"]'::jsonb where code='A1102';
update booth set aliases='["서울특별시 서울도서관"]'::jsonb where code='A1103';
update booth set aliases='["타코쿠마","SpringHill Publishing","Rye Field Publications, a division of Cite Publishing Ltd.","REVE BOOKS LTD., CO","Kuroro space exploration team / memes creative partnership co., ltd.","KAWAII HYOKA / Caiji Art","JS Agency Co., Ltd.","Hakka Affairs Council","DUMPLING CAT FAMILY","CommonWealth Education Media and Publishing Co., Ltd.","타이완콘텐츠진흥원"]'::jsonb where code='A1201';
update booth set aliases='["Silkwormbooks","유기적 링크","모카그룹","MITMAKME Group","Liatris publishing","HAPPYME-D CO., LTD.","Golden C Creative contentCo.,Ltd.","Glory Forever Public Company Limited","Avocado Books (Earlgrey co.,ltd)","DEXPRESS COMPANY LIMITED","Combang Publishing House Limited Partnership","Channasoot Publishing","BANLUE PUBLICATIONS COMPANY LIMITED","Amarin Corporations PCL","주한태국대사관 상무공사관실"]'::jsonb where code='A1202';
update booth set aliases='["VLP Agency","Calcetines Animados","프로칠레"]'::jsonb where code='A1206';
update booth set aliases='["연변인민출판사","연변교육출판사"]'::jsonb where code='A1207';
update booth set aliases='["소장각"]'::jsonb where code='A1308';
update booth set aliases='["아르카","소유","뜰힘","구름이머무는동안","몽당연필"]'::jsonb where code='A1405';
update booth set aliases='["쿰란출판사","블리스","바이블네비게이션(주)","문광서원","동연","CUP","한국기독교출판협회"]'::jsonb where code='A1406';
update booth set aliases='["목수책방","메멘토","가지출판사","에디토리얼"]'::jsonb where code='A1410';
update booth set aliases='["교보문고"]'::jsonb where code='A1701';
update booth set aliases='["Orca Book Publishers","McGill-Queen''s University Press","Les Éditions les Malins","Firefly Books","Éditions Québec Amérique","Éditions Michel Quintin","Éditions Fonfon","Éditions Alto","Drawn & Quarterly","BookLand Press","Annick Press","Livres Canada Books"]'::jsonb where code='A1801';
update booth set aliases='["Schweizerbart/Borntraeger Science Publishers","Rowohlt Verlag GmbH","Palomaa Publishing","MuseARTa GmbH","모어 지베크","Kiepenheuer & Witsch","주한독일문화원","German Pavilion","Dunkcer & Humblot GmbH","Droemer Knaur Publishing Group","Arbeitsgemeinschaft von Jugendbuchverlagen e.V.","독일 프랑크푸르트도서전"]'::jsonb where code='A1803';
update booth set aliases='["폭스코너"]'::jsonb where code='A2003';
update booth set aliases='["호랑이꿈","허밍북스","한밤의빛","책과바람","쥬쥬베북스","좋은습관연구소","아트레이크 출판사","스타라잇 출판사","빅퀘스천 출판사","문학정원","어웨이크","11%","다정한시민","나무의말","그리모어","한국출판문화산업진흥원"]'::jsonb where code='A2009';
update booth set aliases='["은행나무"]'::jsonb where code='A2103';
update booth set aliases='["마음산책"]'::jsonb where code='A2302';
update booth set aliases='["디자인하우스"]'::jsonb where code='A2303';
update booth set aliases='["National Taiwan University Press","Locus Publishing Company","Indie Publishers Association of Taiwan","Heryin Books, Inc.","Chang-Tang Int. Publishing Co.,Ltd","Academia Sinica","타이베이도서전재단"]'::jsonb where code='A2401';
update booth set aliases='["움직씨 출판사"]'::jsonb where code='B102';
update booth set aliases='["페이퍼독"]'::jsonb where code='B104';
update booth set aliases='["컬처룩"]'::jsonb where code='B109';
update booth set aliases='["레모 출판사"]'::jsonb where code='B203';
update booth set aliases='["롤러코스터"]'::jsonb where code='B503';
update booth set aliases='["해파리","페이지미디어브릿지","톰톰프레스","테일브릿지","출판사 이베르","정재이프레스","인생책방/마이북하우스","유유히","여름의서재","여가도시","쓰는사람","스튜디오블랑","스튜디오 에디트","선홍빛","생각하는 달팽이","빛틈","붉은사슴","북스토어블","밤두","물숨","무중력프레스","무블출판사","머핀북","마리유니버스","리케의 디자인랩","두유라이크","두두플래닛","도깨비사","니라이카나이","내로라 출판사","경옥초이","마포출판문화진흥센터"]'::jsonb where code='B504';
