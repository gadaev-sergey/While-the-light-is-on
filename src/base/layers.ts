/** Render contract. Object assignments and extension rules: docs/base/LAYERS.md.
 * Rear atmosphere is composed before the separately lit solid surface. A solid
 * sprite's alpha is its silhouette, never a substitute for lighting or loot state. */
export const RENDER_LAYERS=[
 {id:'background',target:'rear',contents:'Квартал, двор, грунт, дальний забор; ночная луна и звёзды'},
 {id:'walls',target:'rear',contents:'Оболочка, задние стены, проёмы, откосы и потолки'},
 {id:'fixtures',target:'solid',contents:'Радиаторы у задних стен'},
 {id:'interactables',target:'solid',contents:'Мебель и предметы дома и двора'},
 {id:'floors',target:'solid',contents:'Поверхности полов с лестничными проёмами'},
 {id:'stairs',target:'solid',contents:'Марши, вертикальные лестницы и дальние перила'},
 {id:'landings',target:'solid',contents:'Верхние площадки перед лестницами'},
 {id:'doors',target:'solid',contents:'Коробки и полотна: перед мебелью, позади героя; петли у задней стены'},
 {id:'actors',target:'solid',contents:'Герой с клавиатурой, пёс'},
 {id:'foreground',target:'solid',contents:'Торцы, ближние перила, обломки и трава'},
 {id:'lighting',target:'composite',contents:'Дневное и ночное освещение; дымка позади solid; сборка сцены'},
 {id:'visibility',target:'post',contents:'Раздельное размытие rear и solid с сохранением силуэтов'},
 {id:'structure',target:'post',contents:'Чёткие вертикальные стены и чёрные срезы; покрытие пола остаётся под туманом'},
 {id:'markers',target:'overlay',contents:'Значки, прогресс действия, маршрут'},
] as const;
export type RenderLayerId=typeof RENDER_LAYERS[number]['id'];
export const HOUSE_LAYERS=RENDER_LAYERS.map(layer=>layer.id);
