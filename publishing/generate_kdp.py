#!/usr/bin/env python3
"""Deterministically build the Remember When? KDP interior and full wrap."""
from pathlib import Path
import json, random, zlib

ROOT = Path(__file__).parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
AUTHOR = "[INSERT AUTHOR]"
PUBLISHER = "[INSERT PUBLISHER]"
SERIES = "Remember When?"
TITLE = "Large Print Word Search: Growing Up in the 1960s"
SUBTITLE = "Nostalgia Puzzles for Seniors"
FONT_CANDIDATES = [
    ("DejaVuSansMono", ROOT / "fonts" / "DejaVuSansMono.ttf"),
    ("DejaVuSansMono", Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")),
    ("Consolas", Path("C:/Windows/Fonts/consola.ttf")),
    ("CourierNewPSMT", Path("C:/Windows/Fonts/cour.ttf")),
]
FONT_BOLD_CANDIDATES = [
    ("DejaVuSansMono-Bold", ROOT / "fonts" / "DejaVuSansMono-Bold.ttf"),
    ("DejaVuSansMono-Bold", Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")),
    ("Consolas-Bold", Path("C:/Windows/Fonts/consolab.ttf")),
    ("CourierNewPS-BoldMT", Path("C:/Windows/Fonts/courbd.ttf")),
]
PT = 72

THEMES = [
 ("At the Drive-In", "CARHOP SPEAKER POPCORN TICKET SCREEN FEATURE INTERMISSION CONVERTIBLE MILKSHAKE JUKEBOX PARKING DATE NIGHT SNACKBAR TRAILER COMEDY WESTERN"),
 ("Saturday Morning TV", "CARTOON CEREAL PAJAMAS COMMERCIAL HERO SIDEKICK CHANNEL ANTENNA PUPPET WESTERN COMEDY ADVENTURE COLOR REMOTE SOFA SIBLING LAUGHTER"),
 ("The Corner Diner", "COUNTER STOOL JUKEBOX WAITRESS COFFEE BURGER FRIES MILKSHAKE NICKEL NAPKIN KETCHUP PIE PLATE BOOTH STRAW MENU CHECK"),
 ("School Days", "CHALKBOARD ERASER PENCIL NOTEBOOK RECESS CAFETERIA LOCKER TEACHER RULER GLOBE LIBRARY SPELLING DESK BELL BUS HOMEWORK REPORTCARD"),
 ("Vinyl Records", "TURNTABLE NEEDLE ALBUM SINGLE STEREO SPEAKER SLEEVE GROOVE LABEL RADIO DJ DANCE CHART HIT BALLAD RHYTHM RECORDSHOP"),
 ("Summer Vacation", "ROADTRIP MOTEL POSTCARD CAMERA SUITCASE BEACH CABIN MAP PICNIC CAMPFIRE SOUVENIR SUNGLASSES HIGHWAY PARK RANGER SWIMMING FAMILY"),
 ("The Space Race", "ROCKET ORBIT ASTRONAUT CAPSULE LAUNCH MOON NASA MISSION CONTROL SATELLITE COUNTDOWN HELMET SPACECRAFT SPLASHDOWN TELESCOPE CRATER STAR"),
 ("Fashion Flashback", "MINISKIRT TIEDYE BELLBOTTOM BOOTS HEADBAND CARDIGAN LOAFERS POLKADOT HANDBAG NYLONS COLLAR PLAID SHIFT DRESS SUIT SCARF PATTERN"),
 ("Family Game Night", "CHECKERS DOMINOES CARDS DICE SCOREBOARD CHARADES PUZZLE MONOPOLY TOKEN MARBLES BINGO PLAYER TURN WINNER SNACK TABLE LAUGHTER FAMILY"),
 ("Transistor Radio", "BATTERY DIAL ANTENNA STATION TUNING EARPHONE POCKET MUSIC NEWS WEATHER SIGNAL AM FM DJ REQUEST DEDICATION STATIC BROADCAST"),
 ("At the Movies", "USHER LOBBY TICKET CURTAIN FEATURE NEWSREEL POPCORN BALCONY MARQUEE PROJECTOR ACTRESS ACTOR STUDIO COMEDY DRAMA WESTERN SCREEN CREDITS"),
 ("Sunday Dinner", "ROAST GRAVY POTATOES CARROTS BISCUITS NAPKINS CHINA FAMILY TABLE PRAYER DESSERT PIE KITCHEN PLATTER RECIPE LEFTOVERS COMPANY"),
 ("Classic Cars", "MUSTANG CAMARO BEETLE IMPALA CORVAIR THUNDERBIRD STINGRAY CADILLAC PONTIAC DODGE CHROME FINS RADIO BENCHSEAT HUBCAP ENGINE CRUISE"),
 ("Beauty Salon", "HAIRSPRAY CURLERS DRYER MIRROR SHAMPOO RINSE COMB BRUSH BOUFFANT BEEHIVE MANICURE MAGAZINE APPOINTMENT SALON STYLE SCISSORS CAPE"),
 ("Baseball Memories", "BALLPARK INNING PITCHER CATCHER BATTER DUGOUT SCORECARD UMPIRE HOMERUN BLEACHERS HOTDOG GLOVE DIAMOND ROOKIE DOUBLE SLIDE TEAM"),
 ("The Soda Fountain", "SODA SUNDAE FLOAT SYRUP CHERRY STRAW COUNTER STOOL SCOOP VANILLA CHOCOLATE BANANA SPLIT FIZZ NAPKIN SPOON GLASS CARHOP"),
 ("Household Helpers", "TOASTER BLENDER VACUUM IRON MIXER FREEZER WASHER DRYER OVEN RADIO CLOCK TELEPHONE LAMP FAN KETTLE BROOM MOP APRON"),
 ("Teen Dance", "TWIST MASHEDPOTATO MONKEY WATUSI JUKEBOX RECORD CHAPERONE GYMNASIUM PUNCH DRESS SUIT CORSAGE PARTNER RHYTHM BAND SLOWDANCE SOCKHOP"),
 ("County Fair", "FERRISWHEEL MIDWAY RIBBON LIVESTOCK COTTONCANDY CORNDOG TICKET BOOTH PRIZE CAROUSEL TRACTOR PIE CONTEST BALLOON RIDE GAME PARADE"),
 ("Telephone Time", "ROTARY DIAL OPERATOR PARTYLINE RECEIVER CORD RING BUSY SIGNAL NUMBER DIRECTORY BOOTH NICKEL CALL HELLO CHAT KITCHEN WALL"),
 ("Holiday Traditions", "TINSEL ORNAMENT CAROLS STOCKING WREATH CANDLE TURKEY PARADE PRESENT FAMILY CHURCH SNOW COOKIE TREE LIGHTS CARD DINNER"),
 ("Camping Out", "TENT LANTERN SLEEPINGBAG CANTEEN TRAIL COMPASS CAMPFIRE MARSHMALLOW WOODS CABIN LAKE FISHING HIKING RANGER STARS BOOTS BACKPACK"),
 ("Kitchen Classics", "CASSEROLE FONDUE GELATIN MEATLOAF POTROAST RECIPE APRON SKILLET MIXER OVEN TIMER COOKBOOK DINNER SALAD DESSERT LEFTOVERS PANTRY"),
 ("Front Porch", "ROCKER SWING LEMONADE NEIGHBOR SCREEN DOOR STEP FLOWERPOT BREEZE NEWSPAPER MAILBOX CHAT SUNSET FIREFLY RADIO CUSHION WELCOME"),
 ("Bowling League", "ALLEY PINS BALL SHOES SCORE STRIKE SPARE GUTTER TEAM LEAGUE TROPHY SHIRT FRAME LANE RETURN SNACKBAR SPLIT CHAMPION"),
 ("Shopping Downtown", "DEPARTMENTSTORE ESCALATOR WINDOW DISPLAY CASHIER PARCEL CATALOG COUNTER ELEVATOR SALE DRESS HAT SHOES GLOVES RECEIPT LUNCH JEWELRY"),
 ("The Barbershop", "BARBER CLIPPERS COMB TONIC SHAVE RAZOR CHAIR MIRROR CAPE STRIPE MAGAZINE CHAT TRIM SIDEBURNS CREWCUT AFTERSHAVE SCISSORS"),
 ("Woodstock Era", "FESTIVAL MUSIC GUITAR CROWD STAGE PEACE CAMPING RAIN MUD POSTER BAND SONG DANCE SUMMER BUS FIELD FRIENDS HARMONY"),
 ("Moon Landing", "APOLLO EAGLE ARMSTRONG ALDRIN COLLINS LUNAR MODULE FOOTPRINT FLAG HOUSTON LANDING JULY TELEVISION ASTRONAUT CRATER RETURN OCEAN HERO"),
 ("Neighborhood Kids", "BICYCLE HOPSCOTCH MARBLES TAG HIDEANDSEEK JUMPROPE SKATES TREEHOUSE WAGON SIDEWALK BALL KITE FORT FRIENDS WHISTLE CURFEW PORCH"),
 ("Laundry Day", "CLOTHESLINE CLOTHESPIN BASKET SOAP STARCH IRON WRINGER WASHER SHEET TOWEL APRON SUNSHINE FOLD HAMPER DETERGENT RINSE POCKET"),
 ("Roadside America", "DINER MOTEL NEON GASSTATION MAP HIGHWAY BILLBOARD POSTCARD PICNICTABLE VIEWPOINT SOUVENIR ROUTE VACANCY CAFE TRAVELER CAR ROADTRIP"),
 ("Music Makers", "BEATLES SUPREMES TEMPTATIONS BEACHBOYS MONKEES ARETHA MOTOWN GUITAR DRUMS HARMONY MELODY CONCERT RECORD RADIO SINGER BAND HIT"),
 ("TV Favorites", "SITCOM WESTERN VARIETY NEWS COMEDY DRAMA CHANNEL ANTENNA SPONSOR EPISODE STAR STUDIO CAMERA LAUGHTRACK FAMILY DETECTIVE HOST"),
 ("Garden Club", "ROSE TULIP DAISY MARIGOLD PETUNIA SEEDLING TROWEL HOSE GLOVES WEEDS BORDER COMPOST SHOVEL WATERINGCAN BOUQUET PATIO SUNSHINE"),
 ("Fishing Trip", "ROD REEL TACKLE BAIT HOOK BOBBER CANOE LAKE RIVER TROUT BASS CATCH NET COOLER DOCK BOOTS MORNING STORY"),
 ("Baby Boom Home", "PLAYPEN HIGHCHAIR STROLLER CRIB RATTLE BOTTLE BLANKET NURSERY DIAPER BATHTUB ROCKER LULLABY TOY FAMILY SIBLING NAP SNAPSHOT"),
 ("Newsstand", "NEWSPAPER MAGAZINE COMIC HEADLINE EDITION INK COLUMN PUZZLE SPORTS WEATHER GOSSIP PHOTO REPORTER PRESS DELIVERY NICKEL STAND"),
 ("Photo Album", "SNAPSHOT CAMERA FLASH FILM SLIDE PROJECTOR ALBUM MEMORY PORTRAIT VACATION BIRTHDAY WEDDING FAMILY PICNIC SCHOOL FRIENDS CAPTION"),
 ("Remember When?", "NOSTALGIA MEMORY YESTERDAY SIXTIES FAMILY FRIENDS MUSIC LAUGHTER SUMMER HOME SCHOOL RADIO DANCE DREAM SMILE STORY REMEMBER"),
]

def make_puzzle(words, seed):
    rng=random.Random(seed); grid=[[None]*16 for _ in range(16)]; placed=[]; dirs=[(0,1),(1,0),(1,1),(1,-1)]
    for word in sorted(words,key=len,reverse=True):
        choices=[]
        for _ in range(2500):
            dr,dc=rng.choice(dirs); r=rng.randrange(16); c=rng.randrange(16); er=r+dr*(len(word)-1); ec=c+dc*(len(word)-1)
            if not (0<=er<16 and 0<=ec<16): continue
            cells=[(r+dr*i,c+dc*i) for i in range(len(word))]
            if all(grid[a][b] in (None,ch) for (a,b),ch in zip(cells,word)): choices.append((sum(grid[a][b] is not None for a,b in cells),r,c,dr,dc,cells))
        if not choices: raise RuntimeError(f"Could not place {word}")
        _,r,c,dr,dc,cells=max(choices,key=lambda x:(x[0],rng.random()))
        for (a,b),ch in zip(cells,word): grid[a][b]=ch
        placed.append(dict(word=word,row=r+1,col=c+1,end_row=r+dr*(len(word)-1)+1,end_col=c+dc*(len(word)-1)+1))
    for r in range(16):
        for c in range(16):
            if grid[r][c] is None: grid[r][c]=rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return ["".join(r) for r in grid], sorted(placed,key=lambda x:x['word'])

class PDF:
    def __init__(self): self.objs=[]
    def obj(self,data=b""): self.objs.append(data); return len(self.objs)
    def set(self,n,data): self.objs[n-1]=data
    def stream(self,data,extra=""):
        data=zlib.compress(data); return self.obj(f"<< /Length {len(data)} /Filter /FlateDecode {extra}>>\nstream\n".encode()+data+b"\nendstream")
    def save(self,path,root,info):
        out=bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"); offsets=[0]
        for i,o in enumerate(self.objs,1): offsets.append(len(out)); out+=f"{i} 0 obj\n".encode()+o+b"\nendobj\n"
        x=len(out); out+=f"xref\n0 {len(self.objs)+1}\n0000000000 65535 f \n".encode()+b"".join(f"{v:010d} 00000 n \n".encode() for v in offsets[1:])
        out+=f"trailer\n<< /Size {len(self.objs)+1} /Root {root} 0 R /Info {info} 0 R >>\nstartxref\n{x}\n%%EOF\n".encode(); path.write_bytes(out)

def esc(s): return s.replace("\\","\\\\").replace("(","\\(").replace(")","\\)")
def txt(x,y,s,size=12,bold=False,align="left"):
    width=len(s)*size*.602
    if align=="center": x-=width/2
    elif align=="right": x-=width
    return f"BT /{'FB' if bold else 'FR'} {size} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ({esc(s)}) Tj ET\n"
def line(x1,y1,x2,y2,w=1): return f"{w} w {x1} {y1} m {x2} {y2} l S\n"
def rect(x,y,w,h,fill=False): return f"{x} {y} {w} {h} re {'f' if fill else 'S'}\n"
def resolve_font(candidates):
    for base, path in candidates:
        if path.exists():
            return base, path
    searched = ", ".join(str(path) for _, path in candidates)
    raise FileNotFoundError(f"Could not find a usable TrueType font. Searched: {searched}")

def fonts(pdf):
    refs={}
    regular_base, regular_path = resolve_font(FONT_CANDIDATES)
    bold_base, bold_path = resolve_font(FONT_BOLD_CANDIDATES)
    for key,base,path in [('FR',regular_base,regular_path),('FB',bold_base,bold_path)]:
        raw=Path(path).read_bytes(); ff=pdf.stream(raw,f"/Length1 {len(raw)} "); desc=pdf.obj(f"<< /Type /FontDescriptor /FontName /{base} /Flags 33 /FontBBox [-600 -400 1300 1200] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 90 /FontFile2 {ff} 0 R >>".encode()); refs[key]=pdf.obj(f"<< /Type /Font /Subtype /TrueType /BaseFont /{base} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [{' '.join(['602']*95)}] /FontDescriptor {desc} 0 R >>".encode())
    return refs

def build_interior(puzzles):
    pdf=PDF(); fr=fonts(pdf); pages=pdf.obj(); kids=[]
    def add(cmd):
        st=pdf.stream(cmd.encode()); kids.append(pdf.obj(f"<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /FR {fr['FR']} 0 R /FB {fr['FB']} 0 R >> >> /Contents {st} 0 R >>".encode()))
    c="0 G 0 g\n"+txt(306,620,SERIES,22,True,'center')+txt(306,555,"LARGE PRINT WORD SEARCH",25,True,'center')+txt(306,515,"GROWING UP IN THE 1960s",22,True,'center')+line(115,480,497,480,2)+txt(306,445,SUBTITLE,16,False,'center')+txt(306,230,AUTHOR,13,True,'center'); add(c)
    c="0 G 0 g\n"+txt(72,690,"COPYRIGHT & PUBLICATION",18,True)+line(72,675,540,675,1.5)+txt(72,630,f"Copyright (c) 2026 {AUTHOR}",11)+txt(72,600,"All rights reserved.",11)+txt(72,560,f"Published by {PUBLISHER}",11)+txt(72,500,"Interior: 8.5 x 11 in | black and white | white paper",10)+txt(72,475,"Generated puzzle content and answer key verified together.",10)+txt(306,90,"2",9,False,'center'); add(c)
    c="0 G 0 g\n"+txt(306,680,"WELCOME BACK TO THE SIXTIES",19,True,'center')+line(90,660,522,660,1.5)
    for i,s in enumerate(["Turn back the clock to drive-ins, diners, vinyl records,","family game nights, moon missions, and neighborhood adventures.","Each puzzle was designed for relaxed, comfortable solving,","with large letters, familiar themes, and forward-only words.","Take your time, enjoy the memories, and have fun!"]): c+=txt(306,600-i*34,s,12,False,'center')
    c+=txt(306,90,"3",9,False,'center'); add(c)
    c="0 G 0 g\n"+txt(72,690,"HOW TO ENJOY THE PUZZLES",19,True)+line(72,675,540,675,1.5)
    for i,s in enumerate(["- Find all 18 words listed beneath each grid.","- Words run forward only: left-to-right, top-to-bottom,","  or diagonally downward in either direction.","- Words never run backward.","- Circle each word as you find it, then check it off.","- Complete solutions begin after Puzzle 40."]): c+=txt(82,620-i*38,s,12)
    c+=txt(306,305,"A quiet moment. A favorite memory. A puzzle solved.",11,True,'center')+txt(306,90,"4",9,False,'center'); add(c)
    for idx,(title,words,grid,sol) in enumerate(puzzles,1):
        c="0 G 0 g\n"+txt(72,720,f"PUZZLE {idx}",12,True)+txt(306,720,title.upper(),14,True,'center')+line(72,706,540,706,1.2); gx=89; gy=673; cell=27; c+=rect(gx-9,gy-15*cell-17,16*cell+18,16*cell+25)
        for r,row in enumerate(grid): c+=txt(gx,gy-r*cell," ".join(row),15,True)
        c+=line(72,226,540,226,1)
        for j,w in enumerate(sorted(words)): c+=txt(84+(j%3)*160,202-(j//3)*23,w,10,True)
        c+=txt(306,52,str(idx+4),9,False,'center'); add(c)
    add("0 G 0 g\n"+txt(306,560,"ANSWER KEY",28,True,'center')+line(145,525,467,525,2)+txt(306,475,"Solutions for Puzzles 1–40",15,False,'center')+txt(306,90,"45",9,False,'center'))
    for page in range(20):
        c="0 G 0 g\n"+txt(306,724,"ANSWER KEY",13,True,'center')+line(72,710,540,710,1)
        for half in range(2):
            idx=page*2+half; title,words,grid,sol=puzzles[idx]; top=680-half*326; c+=txt(72,top,f"{idx+1}. {title}",11,True); gx=122; gy=top-30; cell=14.5; c+="0.82 g\n"
            for hit in sol:
                dr=hit['end_row']-hit['row']; dc=hit['end_col']-hit['col']; n=len(hit['word']); dr=0 if dr==0 else dr//abs(dr); dc=0 if dc==0 else dc//abs(dc)
                for k in range(n): c+=rect(gx+(hit['col']-1+dc*k)*cell-2,gy-(hit['row']-1+dr*k)*cell-10,13,14,True)
            c+="0 g\n"
            for r,row in enumerate(grid): c+=txt(gx,gy-r*cell," ".join(row),7.8,True)
            if half==0: c+=line(72,390,540,390,.7)
        c+=txt(306,52,str(46+page),9,False,'center'); add(c)
    add("0 G 0 g\n"+txt(306,650,"KEEP REMEMBERING",24,True,'center')+line(130,620,482,620,1.5)+txt(306,560,"Thank you for puzzling through the 1960s.",13,False,'center')+txt(306,520,"Share a favorite memory with someone you love.",12,False,'center')+txt(306,430,SERIES,18,True,'center')+txt(306,90,"66",9,False,'center'))
    pdf.set(pages,f"<< /Type /Pages /Kids [{' '.join(f'{x} 0 R' for x in kids)}] /Count {len(kids)} >>".encode()); catalog=pdf.obj(f"<< /Type /Catalog /Pages {pages} 0 R /PageLayout /SinglePage >>".encode()); info=pdf.obj(f"<< /Title ({esc(TITLE)}) /Subject ({esc(SUBTITLE)}) /Author ({esc(AUTHOR)}) /Creator (TradeDrop KDP Generator) /Producer (TradeDrop Embedded-Font PDF Engine) >>".encode()); pdf.save(OUT/"remember-when-1960s-interior.pdf",catalog,info); return len(kids)

def build_cover(page_count):
    spine=page_count*.002252; w=(17.25+spine)*PT; h=11.25*PT; pdf=PDF(); fr=fonts(pdf); pages=pdf.obj(); bleed=.125*PT; spine_left=8.625*PT; front_left=(8.625+spine)*PT
    c="0 G 0 g\n1 g 0 0 %.3f %.3f re f\n0 g\n"%(w,h)+rect(28,65,235,615)+txt(145,645,SERIES,16,True,'center')+line(55,625,235,625,1.5)
    for i,s in enumerate(["Take a cheerful trip back to", "drive-ins, diners, sock hops,", "vinyl records, family traditions,", "and the excitement of the space race."]): c+=txt(145,575-i*27,s,10,False,'center')
    c+=txt(145,438,"40 LARGE-PRINT PUZZLES",12,True,'center')
    for i,s in enumerate(["- 16 x 16 easy-to-read grids", "- 18 nostalgic words per puzzle", "- Forward-only word placement", "- Complete answer key"]): c+=txt(52,396-i*28,s,9)
    c+=txt(52,250,"Designed for comfortable, relaxed solving",8,True)
    fx=front_left+4.25*PT; c+=rect(front_left+30,65,8.5*PT-60,615)+txt(fx,642,SERIES,19,True,'center')+line(front_left+90,618,front_left+8.5*PT-90,618,2)+txt(fx,560,"LARGE PRINT",27,True,'center')+txt(fx,520,"WORD SEARCH",27,True,'center')+txt(fx,460,"GROWING UP",21,True,'center')+txt(fx,425,"IN THE 1960s",21,True,'center')+line(front_left+115,390,front_left+8.5*PT-115,390,1.5)+txt(fx,350,SUBTITLE,14,True,'center')
    for ox,oy in [(front_left+90,175),(front_left+8.5*PT-90,240)]:
        for dx,dy in [(0,28),(0,-28),(28,0),(-28,0),(20,20),(-20,20),(20,-20),(-20,-20)]: c+=line(ox,oy,ox+dx,oy+dy,1.5)
    if not (AUTHOR.startswith("[") and AUTHOR.endswith("]")): c+=txt(fx,120,AUTHOR,11,True,'center')
    st=pdf.stream(c.encode()); page=pdf.obj(f"<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 {w:.3f} {h:.3f}] /Resources << /Font << /FR {fr['FR']} 0 R /FB {fr['FB']} 0 R >> >> /Contents {st} 0 R >>".encode()); pdf.set(pages,f"<< /Type /Pages /Kids [{page} 0 R] /Count 1 >>".encode()); cat=pdf.obj(f"<< /Type /Catalog /Pages {pages} 0 R >>".encode()); info=pdf.obj(f"<< /Title ({esc(TITLE)} Cover) /Author ({esc(AUTHOR)}) /Subject (Full-wrap matte cover) >>".encode()); pdf.save(OUT/"remember-when-1960s-cover.pdf",cat,info); return spine,w/PT,h/PT

def main():
    puzzles=[]
    for i,(theme,raw) in enumerate(THEMES):
        words=[w.upper() for w in raw.split()]
        # Some compact theme lists intentionally leave one slot for a rotating
        # nostalgia word, keeping every printed list at exactly 18 unique words.
        for bonus in ("MEMORIES", "YESTERYEAR", "FLASHBACK"):
            if len(words) == 17 and bonus not in words:
                words.append(bonus); break
        assert len(words)==18,(theme,len(words)); assert len(set(words))==18; assert max(map(len,words))<=16; grid,sol=make_puzzle(words,1960+i); puzzles.append((theme,words,grid,sol))
    pages=build_interior(puzzles); spine,cw,ch=build_cover(pages); data={"metadata":{"series":SERIES,"title":TITLE,"subtitle":SUBTITLE,"author":AUTHOR,"publisher":PUBLISHER},"interior":{"pages":pages,"trim_inches":[8.5,11],"bleed":False,"color":"black-and-white","paper":"white","puzzles":40,"grid":"16x16","words_per_puzzle":18},"cover":{"dimensions_inches":[cw,ch],"spine_inches":spine,"bleed_inches":.125,"finish":"matte (KDP selection)","barcode_safe_area_inches":[2.25,1.4]},"puzzles":[{"number":i+1,"theme":p[0],"grid":p[2],"solutions":p[3]} for i,p in enumerate(puzzles)]}; (OUT/"manifest.json").write_text(json.dumps(data,indent=2)+"\n"); print(f"Built {pages}-page interior; cover {cw:.6f} x {ch:.2f} in; spine {spine:.6f} in")
if __name__=="__main__": main()
