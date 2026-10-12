/** Original anime scene drawn as layered SVG, with procedural architecture and lighting. */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('../web/node_modules/playwright');
const out=resolve('demo/27_anime_art_direction');mkdirSync(out,{recursive:true});

const windowGrid=(x,y,cols,rows,size,gap)=>Array.from({length:cols*rows},(_,i)=>{
 const wx=x+(i%cols)*gap,wy=y+Math.floor(i/cols)*gap*1.35;
 return `<g><rect x="${wx-3}" y="${wy-3}" width="${size+6}" height="${size*1.4+6}" fill="#ead4ae"/><rect x="${wx}" y="${wy}" width="${size}" height="${size*1.4}" fill="#748c8a"/><path d="M${wx+size*.5} ${wy} V${wy+size*1.4} M${wx} ${wy+size*.7} H${wx+size}" stroke="#b4ba9e" stroke-width="1.5"/><path d="M${wx+size-2} ${wy+3} L${wx+3} ${wy+size*1.35}" stroke="#acc5be" stroke-width="2" opacity=".35"/></g>`;
}).join('');
const roof=(x,y,w,h)=>{
 const d=`M${x-15} ${y+35} L${x+w*.42} ${y-h} L${x+w+20} ${y+12} L${x+w+9} ${y+40} L${x-12} ${y+55}Z`;
 return `<g><defs><clipPath id="roof-${x}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="#a36550" stroke="#77524c" stroke-width="2"/><g clip-path="url(#roof-${x})">${Array.from({length:7},(_,i)=>`<path d="M${x-11+i*4} ${y+42-i*8} L${x+w+15-i*4} ${y+29-i*8}" stroke="#d19a76" stroke-width="2" opacity=".75"/>`).join('')}</g><path d="M${x-12} ${y+55} L${x+w+9} ${y+40}" stroke="#734e49" stroke-width="5"/></g>`;
};
const leaves=(x,y,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 100 Q12 39 4 -55 M7 23 Q-24 -12 -42 -38 M7 10 Q36 -22 57 -37" fill="none" stroke="#476859" stroke-width="3"/><g fill="#4e7661"><path d="M4 -15 Q-22 -48 2 -88 Q30 -61 4 -15Z M-18 -16 Q-54 -12 -61 -52 Q-28 -57 -18 -16Z M20 -7 Q33 -54 69 -55 Q77 -17 20 -7Z M-2 36 Q-38 54 -56 19 Q-24 4 -2 36Z M12 47 Q35 11 65 32 Q53 66 12 47Z"/></g><g fill="#82a27b"><path d="M4 -15 Q-11 -51 2 -80 Q5 -53 4 -15Z M20 -7 Q40 -34 64 -49 Q44 -23 20 -7Z M12 47 Q35 22 59 34 Q34 38 12 47Z"/></g></g>`;

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1280" viewBox="0 0 900 1280">
<defs>
 <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#728f9f"/><stop offset=".5" stop-color="#c9d5cd"/><stop offset="1" stop-color="#ffe3b8"/></linearGradient>
 <linearGradient id="stone" x2="1" y2=".7"><stop stop-color="#e6cfac"/><stop offset="1" stop-color="#b69d7f"/></linearGradient>
 <linearGradient id="wall" x2="1" y2="1"><stop stop-color="#ddc6a4"/><stop offset="1" stop-color="#aa9074"/></linearGradient>
 <linearGradient id="cloth" x2="1" y2=".3"><stop stop-color="#438080"/><stop offset=".48" stop-color="#3a7578"/><stop offset="1" stop-color="#27535f"/></linearGradient>
 <linearGradient id="hair" x2="1" y2=".5"><stop stop-color="#504344"/><stop offset=".45" stop-color="#302f3c"/><stop offset="1" stop-color="#212b39"/></linearGradient>
 <linearGradient id="skin" x2="1" y2=".6"><stop stop-color="#f1c8a6"/><stop offset=".62" stop-color="#e5b491"/><stop offset="1" stop-color="#cf9b7e"/></linearGradient>
 <linearGradient id="iris" x2="0" y2="1"><stop stop-color="#4f3c35"/><stop offset=".5" stop-color="#8c6c49"/><stop offset="1" stop-color="#d6b26c"/></linearGradient>
 <linearGradient id="floor" x2="0" y2="1"><stop stop-color="#e1c39e"/><stop offset="1" stop-color="#aa8f78"/></linearGradient>
 <linearGradient id="jeans" x2="1" y2=".4"><stop stop-color="#6d92aa"/><stop offset="1" stop-color="#3a5e7f"/></linearGradient>
 <radialGradient id="sun"><stop stop-color="#fff6d5" stop-opacity=".8"/><stop offset="1" stop-color="#ffe5bd" stop-opacity="0"/></radialGradient>
 <filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>
 <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
 <clipPath id="eyeL"><path d="M343 425 Q364 407 389 422 Q384 446 362 444 Q349 440 343 425Z"/></clipPath>
 <clipPath id="eyeR"><path d="M421 420 Q445 403 465 418 Q459 439 438 439 Q426 435 421 420Z"/></clipPath>
</defs>
<!-- Atmospheric layers and painted cloud shapes. -->
<rect width="900" height="1280" fill="url(#sky)"/>
<ellipse cx="157" cy="362" rx="250" ry="222" fill="url(#sun)"/>
<g fill="#f4eedc" opacity=".7"><path d="M-40 210 Q30 180 85 203 Q113 161 163 189 Q206 174 260 211 Q314 201 362 226 Q202 251 38 242Z"/><path d="M393 102 Q424 79 463 91 Q503 64 537 98 Q589 82 644 112 Q565 136 444 124Z"/></g>
<g fill="#f5ead2" opacity=".4"><path d="M535 290 Q610 251 667 284 Q721 254 775 285 Q832 269 928 312 Q723 336 535 322Z"/></g>
<!-- Distant town, desaturated with depth. -->
<g opacity=".5" fill="#879a97"><path d="M0 583 V455 H55 V422 H110 V487 H181 V430 H231 V497 H289 V399 H334 V512 H395 V470 H458 V533 H522 V461 H591 V422 H625 V532 H720 V469 H772 V495 H900 V657Z"/></g>
<g opacity=".88"><path d="M36 533 L183 507 L185 760 L31 775Z" fill="#d5b491"/>${windowGrid(55,555,3,3,19,42)}${roof(32,499,151,42)}
<path d="M655 489 L805 510 V787 L644 763Z" fill="#d5c3a5"/>${windowGrid(674,545,3,3,18,39)}${roof(648,487,150,39)}
<path d="M140 649 L328 615 V869 L138 899Z" fill="#b4b39a"/>${windowGrid(167,664,4,3,18,38)}${roof(137,617,194,54)}
<path d="M559 663 L695 643 V867 L554 883Z" fill="#cbab88"/>${windowGrid(576,690,3,3,16,34)}${roof(555,630,144,39)}</g>
<!-- Veranda architecture: beams, shadowed recess, cables and a carved railing. -->
<path d="M0 0 H900 V76 L0 113Z" fill="#3d4848"/>
<path d="M0 77 L900 42 V79 L0 127Z" fill="#66706b"/>
<path d="M0 96 L900 62" stroke="#b49e7c" stroke-width="5"/>
<path d="M-10 62 H83 L96 990 H-10Z" fill="url(#stone)"/>
<path d="M59 103 L83 104 L95 990 H72Z" fill="#b2997a"/>
<path d="M15 113 L28 920" stroke="#f3d8b2" stroke-width="5" opacity=".5"/>
<path d="M836 72 H910 V1010 H850Z" fill="url(#wall)"/>
<path d="M838 85 L851 988" stroke="#8e7a66" stroke-width="7"/>
<path d="M92 191 Q410 244 841 159" fill="none" stroke="#596565" stroke-width="2"/>
${[148,286,592,746].map((x,i)=>`<g transform="translate(${x} ${194+[6,19,-3,-20][i]})"><path d="M0 0 V12" stroke="#596565" stroke-width="2"/><ellipse cy="20" rx="6" ry="9" fill="#f4d894" stroke="#af9670" stroke-width="2"/></g>`).join('')}
<path d="M0 936 L900 871 V1280 H0Z" fill="url(#floor)"/>
<g stroke="#917c66" opacity=".48" stroke-width="2"><path d="M-20 1054 L900 968 M-20 1199 L900 1102 M139 923 L-51 1280 M341 907 L254 1280 M598 892 L679 1280 M771 878 L980 1280"/></g>
<path d="M83 784 L847 749 L850 805 L88 844Z" fill="#e4d2b0" stroke="#947f66" stroke-width="3"/>
<path d="M90 833 L849 794 V818 L92 858Z" fill="#a69076"/>
${[122,202,283,611,701,791].map(x=>`<g><path d="M${x} 845 Q${x+17} 869 ${x+7} 909 Q${x-9} 941 ${x+4} 976 L${x+29} 974 Q${x+16} 937 ${x+33} 905 Q${x+39} 863 ${x+25} 842Z" fill="#d5c19f" stroke="#a38b70" stroke-width="2"/><path d="M${x+8} 862 Q${x+25} 886 ${x+13} 921" fill="none" stroke="#f0dbb6" stroke-width="4"/></g>`).join('')}
<!-- Plants break the architecture's rigid edges. -->
${leaves(135,821,1.2)}<path d="M97 917 H184 L173 1037 Q140 1050 109 1037Z" fill="#b77c60" stroke="#85624f" stroke-width="3"/><path d="M99 932 H181 M106 964 H178" stroke="#d59a75" stroke-width="5"/>
${leaves(772,823,.8)}<path d="M744 885 H810 L799 969 Q773 977 753 967Z" fill="#749184" stroke="#49685e" stroke-width="3"/>
<!-- Original adult character, standing in the light rather than floating over the scene. -->
<ellipse cx="428" cy="1184" rx="176" ry="35" fill="#76695c" opacity=".24" filter="url(#blur)"/>
<g id="character">
<!-- Rear hair is rendered before skin, neck and clothing. -->
<path d="M327 323 Q264 345 279 472 Q278 584 321 665 L350 599 L374 411 L447 378 L451 596 L485 652 Q520 559 512 465 Q532 354 474 311 Q398 260 327 323Z" fill="url(#hair)" stroke="#2d3039" stroke-width="3"/>
<path d="M300 394 Q280 534 326 626 M490 393 Q518 517 481 613" fill="none" stroke="#69606a" stroke-width="2" opacity=".5"/>
<!-- Neck terminates inside the collar. -->
<path d="M370 538 L363 620 Q408 650 447 612 L436 534Z" fill="url(#skin)" stroke="#39333a" stroke-width="3"/>
<path d="M371 547 Q405 574 436 540 L440 568 Q403 592 369 573Z" fill="#b7836d" opacity=".58"/>
<!-- Legs and shaped waistband, beneath the long kurta. -->
<path d="M329 933 Q412 960 502 929 Q527 1000 509 1083 L506 1285 H437 L423 1102 L405 1285 H331 L316 1088 Q303 1009 329 933Z" fill="url(#jeans)" stroke="#303746" stroke-width="3"/>
<path d="M333 961 Q417 982 508 958 M435 972 L440 1064 Q431 1074 421 1073 M346 981 Q351 1020 378 1024 M489 978 Q484 1011 463 1019" fill="none" stroke="#a2b5ba" stroke-width="2.5"/>
<path d="M342 1134 L375 1126 M464 1138 L495 1128" fill="none" stroke="#2e506e" stroke-width="2"/>
<!-- Far arm and curved elbow are built underneath the sleeve. -->
<path d="M319 658 Q263 736 286 818 L326 878 Q337 889 347 881 L351 867 L312 806 Q300 751 350 694Z" fill="url(#skin)" stroke="#39333a" stroke-width="3"/>
<path d="M306 788 Q318 795 329 794" fill="none" stroke="#ae7f68" stroke-width="2"/>
<!-- Fitted kurta, with folds following torso and posture. -->
<path d="M322 631 L363 610 Q408 648 447 609 L493 635 Q513 704 497 780 Q477 846 504 945 L525 1050 Q428 1083 320 1054 L321 942 Q339 841 317 780 Q295 701 322 631Z" fill="url(#cloth)" stroke="#303742" stroke-width="3"/>
<path d="M347 628 Q375 650 404 654 L418 769 Q389 729 357 697Z" fill="#79a39b" opacity=".28"/>
<path d="M480 664 Q510 729 477 801 Q455 901 493 1029 L517 1049 Q489 908 501 832 Q520 740 495 660Z" fill="#224e5d" opacity=".65"/>
<path d="M322 630 L357 613 Q338 646 337 678 L301 693 Q300 656 322 630Z M459 614 L494 637 Q515 663 522 715 L487 732 Q483 665 459 614Z" fill="#427b7b" stroke="#303742" stroke-width="3"/>
<path d="M308 681 L337 671 M491 720 L518 707" stroke="#92aaa0" stroke-width="4"/>
<path d="M363 620 Q407 660 447 619 M407 649 L417 807" fill="none" stroke="#c3b58a" stroke-width="3"/>
<path d="M368 622 Q407 650 442 622" fill="none" stroke="#668f84" stroke-width="2"/>
${[682,714,746,778].map(y=>`<circle cx="${409+(y-682)*.06}" cy="${y}" r="2.8" fill="#d8c699" stroke="#7e826c" stroke-width="1"/>`).join('')}
<g fill="none" stroke="#234f5b" stroke-width="2" opacity=".6"><path d="M351 731 Q374 750 394 746 M337 791 Q358 811 375 808 M351 850 Q384 845 402 851 M450 853 Q476 867 490 854 M344 915 Q372 891 394 893 M457 942 Q479 966 500 972 M357 1022 Q403 1028 431 1022"/></g>
<path d="M333 1029 Q425 1055 518 1027" fill="none" stroke="#a5b49a" stroke-width="3"/>
${Array.from({length:13},(_,i)=>`<path d="M${344+i*13} ${1036+Math.sin(i*.25)*7} l4 5 l4 -5 l-4 -5Z" fill="none" stroke="#b9bf9b" stroke-width="1.2" opacity=".8"/>`).join('')}
<!-- Near forearm supports a small phone; fingers wrap around its edges. -->
<path d="M510 706 Q540 758 520 801 Q499 824 448 813 L408 796 Q399 787 408 779 Q416 773 427 779 L465 786 Q491 790 494 777 Q502 747 480 721Z" fill="url(#skin)" stroke="#39333a" stroke-width="3"/>
<path d="M504 787 Q515 794 520 788" fill="none" stroke="#b18167" stroke-width="2"/>
<g transform="rotate(-11 407 772)"><rect x="387" y="719" width="43" height="76" rx="6" fill="#2e3946" stroke="#252d38" stroke-width="2.5"/><rect x="392" y="724" width="33" height="65" rx="3" fill="#526974"/><path d="M397 728 H420" stroke="#748f93" stroke-width="2"/><circle cx="408" cy="785" r="2" fill="#84979a"/></g>
<path d="M422 779 Q405 776 402 783 Q400 790 418 794 M421 793 Q408 792 406 798 Q408 803 424 804" fill="url(#skin)" stroke="#9a6f5b" stroke-width="2" stroke-linecap="round"/>
<path d="M468 783 L461 808 M475 785 L468 810" stroke="#d0b880" stroke-width="3"/>
<!-- Shorter, softer face with controlled line weight and shadow planes. -->
<path d="M337 354 Q393 319 453 347 Q480 370 479 421 Q478 506 441 544 Q409 573 377 548 Q332 514 326 450 Q319 393 337 354Z" fill="url(#skin)" stroke="#38323b" stroke-width="3"/>
<path d="M452 350 Q478 375 478 421 Q477 498 441 541 L431 540 Q453 493 451 437 Q450 392 434 370Z" fill="#c9947a" opacity=".35"/>
<path d="M328 449 Q333 486 349 505" fill="none" stroke="#f8d6b2" stroke-width="3" opacity=".65"/>
<path d="M470 424 Q495 412 489 447 Q485 469 473 467" fill="#d4a081" stroke="#38323b" stroke-width="2.5"/>
<path d="M480 432 Q490 426 481 452" fill="none" stroke="#a77562" stroke-width="2"/>
<!-- Eyelids carry more weight than lower contours; iris depth and small glints give focus. -->
<path d="M343 425 Q364 407 389 422 Q384 446 362 444 Q349 440 343 425Z" fill="#fff5e8"/>
<g clip-path="url(#eyeL)"><ellipse cx="362" cy="425" rx="12" ry="19" fill="url(#iris)"/><ellipse cx="362" cy="421" rx="5" ry="11" fill="#332c2c"/><ellipse cx="357" cy="418" rx="3" ry="4" fill="#fffaf1"/><circle cx="368" cy="434" r="2" fill="#fce1a0"/></g>
<path d="M341 426 Q361 404 390 420" fill="none" stroke="#352d34" stroke-width="4" stroke-linecap="round"/>
<path d="M347 437 Q366 449 382 440" fill="none" stroke="#aa7867" stroke-width="1.5"/><path d="M344 423 L339 417" stroke="#352d34" stroke-width="2"/>
<path d="M421 420 Q445 403 465 418 Q459 439 438 439 Q426 435 421 420Z" fill="#fff5e8"/>
<g clip-path="url(#eyeR)"><ellipse cx="439" cy="421" rx="11" ry="18" fill="url(#iris)"/><ellipse cx="439" cy="418" rx="5" ry="11" fill="#332c2c"/><ellipse cx="434" cy="413" rx="3" ry="4" fill="#fffaf1"/><circle cx="445" cy="430" r="2" fill="#fce1a0"/></g>
<path d="M421 418 Q444 400 467 418" fill="none" stroke="#352d34" stroke-width="4" stroke-linecap="round"/>
<path d="M429 433 Q445 442 459 432" fill="none" stroke="#aa7867" stroke-width="1.5"/><path d="M464 416 L470 410" stroke="#352d34" stroke-width="2"/>
<path d="M343 400 Q362 388 386 396 M421 391 Q442 381 461 391" fill="none" stroke="#6a4941" stroke-width="3" stroke-linecap="round"/>
<path d="M406 430 L399 470 Q406 475 412 468" fill="none" stroke="#b48169" stroke-width="2" stroke-linecap="round"/>
<path d="M413 458 L420 465" stroke="#f6d0a9" stroke-width="2" stroke-linecap="round"/>
<path d="M386 503 Q404 499 424 498 Q408 512 392 508Z" fill="#b47b77" opacity=".55"/>
<path d="M386 503 Q405 510 424 498" fill="none" stroke="#935b60" stroke-width="2.5" stroke-linecap="round"/>
<path d="M397 513 Q407 516 416 510" fill="none" stroke="#efbd9f" stroke-width="2"/>
<!-- Scalp and intentional forehead locks never cover the eyes or jaw. -->
<path d="M312 385 Q297 342 332 313 Q360 287 407 302 Q446 286 475 321 Q499 345 495 391 Q460 381 438 351 Q421 330 411 324 Q393 356 354 367 Q366 343 371 327 Q345 367 312 385Z" fill="url(#hair)" stroke="#2d3039" stroke-width="3" stroke-linejoin="round"/>
<path d="M406 306 Q362 308 331 347 M413 308 Q442 322 471 362 M390 319 Q376 341 358 351" fill="none" stroke="#847078" stroke-width="2" opacity=".65"/>
<path d="M325 365 Q334 348 348 338 M431 332 Q451 352 469 365" fill="none" stroke="#b28b80" stroke-width="1.4" opacity=".55"/>
<!-- Fine gold jewellery with asymmetrical lit edge. -->
<circle cx="481" cy="461" r="4" fill="#d1b574" stroke="#88714f" stroke-width="1.5"/><path d="M481 465 V473" stroke="#d1b574" stroke-width="2"/><path d="M471 487 Q471 469 481 469 Q491 469 491 487Z" fill="#c9a263" stroke="#88714f" stroke-width="1.5"/><path d="M475 481 Q481 474 487 481" fill="none" stroke="#f4d79b" stroke-width="1.5"/><g fill="#ecd49b"><circle cx="472" cy="491" r="2"/><circle cx="477" cy="493" r="2"/><circle cx="482" cy="494" r="2"/><circle cx="487" cy="492" r="2"/><circle cx="491" cy="489" r="2"/></g>
<path d="M366 622 Q407 680 447 621" fill="none" stroke="#cdb885" stroke-width="1.5"/><circle cx="408" cy="654" r="3" fill="#e1cca0"/>
</g>
<!-- Warm foreground light and a restrained grain unify the drawn layers. -->
<rect width="900" height="1280" fill="#edb875" opacity=".045"/>
<rect width="900" height="1280" filter="url(#paper)" opacity=".045" style="mix-blend-mode:multiply"/>
</svg>`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:900,height:1280},deviceScaleFactor:1});
await page.setContent(svg);
await page.screenshot({path:join(out,'anime-scene-art-study.png')});
await browser.close();
