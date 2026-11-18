// A secondary check for common complete-recipe formats, beyond model instructions.
// It deliberately does not attempt to prove semantic safety for every possible wording.
export function containsCompleteRecipe(text){
  if(typeof text!=='string')return false;
  const value='(?:[0-6零一二三四五六])';
  const tuple=new RegExp('[\\[（(]\\s*'+value+'(?:\\s*[,，、/;；]\\s*'+value+'){4}\\s*[\\]）)]');
  if(tuple.test(text))return true;
  if(/(?:依次|顺序|食谱|配方|组合|五种)/.test(text)&&new RegExp(value+'(?:\\s*[,，、/]\\s*'+value+'){4}(?!\\s*[,，、/]\\s*[0-9])').test(text))return true;
  const names=['雾绒草','蓝铃叶','星冠蕨','珊瑚枝','月芽藤'];
  return names.every(name=>new RegExp(name+'[^。！？;；\\n]{0,10}?(?:[×x:：=]|用|选|给|为|是|到|约)?\\s*'+value+'(?:\\s*份)?').test(text));
}
