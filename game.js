let score=0;
const scoreEl=document.getElementById('score');
document.getElementById('cow').addEventListener('click',()=>{
 score++;
 scoreEl.textContent=score.toLocaleString();
});
